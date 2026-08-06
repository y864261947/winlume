package relay

import (
	"context"
	"errors"
	"io"
	"net/http"
	"time"
)

// RetryReason is a fixed, sanitized label for why an attempt was retried. It
// is never derived from raw error text, so it is always safe to persist.
type RetryReason string

const (
	RetryReasonNone RetryReason = ""
	// RetryReasonTransportBeforeSend means the outgoing request never reached
	// the upstream connection (dial failure, DNS failure, refused
	// connection): the upstream cannot have accepted work it never received,
	// so this is always safe to retry, even for a task submission.
	RetryReasonTransportBeforeSend RetryReason = "transport_before_send"
	// RetryReasonTransportUncertain means the request was written to the
	// upstream connection (including a response-header timeout) before the
	// failure, so upstream acceptance is uncertain. It is retried only for
	// requests that are not task submissions.
	RetryReasonTransportUncertain RetryReason = "transport_uncertain"
	// RetryReasonUpstreamStatus means the upstream returned a configured
	// retryable status code before any bytes were streamed to the
	// downstream client.
	RetryReasonUpstreamStatus RetryReason = "upstream_status"
)

// RetryPolicy configures which relay failures are safe to retry within one
// shared billing operation. It intentionally carries no pricing, funding, or
// selector state - only transport-level knobs.
type RetryPolicy struct {
	// MaxAttempts is the maximum number of relay attempts for one logical
	// request, including the first. Values <= 1 disable retries.
	MaxAttempts int
	// RetryableStatuses lists upstream status codes that may be retried
	// while the downstream response is still uncommitted.
	RetryableStatuses map[int]struct{}
}

// DefaultRetryPolicy returns the gateway's baseline retry configuration: up
// to three attempts, retrying only the classic "upstream is temporarily
// unavailable" status family.
func DefaultRetryPolicy() RetryPolicy {
	return RetryPolicy{
		MaxAttempts: 3,
		RetryableStatuses: map[int]struct{}{
			http.StatusBadGateway:         {},
			http.StatusServiceUnavailable: {},
			http.StatusGatewayTimeout:     {},
		},
	}
}

func (policy RetryPolicy) maxAttempts() int {
	if policy.MaxAttempts <= 0 {
		return 1
	}
	return policy.MaxAttempts
}

func (policy RetryPolicy) statusRetryable(status int) bool {
	if policy.RetryableStatuses == nil {
		return false
	}
	_, ok := policy.RetryableStatuses[status]
	return ok
}

// Relay drives the retry loop for one logical request: it selects a channel,
// attempts the relay, and - while the downstream response remains
// uncommitted - retries configured transport errors, timeouts before
// response headers, and configured upstream statuses. It stops retrying the
// moment it has a response worth streaming to the client (success or a
// non-retryable failure), so the caller can start streaming immediately
// without risking a second attempt after bytes have already been committed.
//
// Relay never touches billing: it has no Operation, no pricing engine, and
// no funding policy. A caller wraps one Lifecycle.Begin before calling Relay
// and one Lifecycle.Complete/Fail after it returns, so every retry recorded
// in the returned AttemptHistory shares that single billing operation.
func (client *Client) Relay(ctx context.Context, request Request, policy RetryPolicy) (*http.Response, AttemptHistory, error) {
	if client == nil {
		return nil, nil, ErrNoChannel
	}
	maxAttempts := policy.maxAttempts()
	var history AttemptHistory
	var lastErr error

	for attemptNumber := 1; attemptNumber <= maxAttempts; attemptNumber++ {
		channel, err := client.selectChannel(ctx, request, history)
		if err != nil {
			return nil, history, err
		}
		remaining := attemptNumber < maxAttempts

		startedAt := time.Now().UTC()
		response, wrote, doErr := client.relayAttempt(ctx, request, channel)
		completedAt := time.Now().UTC()

		if doErr != nil {
			retry, reason, errorClass := classifyAttemptError(ctx, doErr, wrote, request.TaskSubmission, remaining)
			outcome := AttemptFailed
			if retry {
				outcome = AttemptRetried
			}
			history = append(history, Attempt{
				Number: attemptNumber, ChannelID: channel.ID, RawType: channel.RawType,
				StartedAt: startedAt, CompletedAt: completedAt, Status: 0,
				Outcome: outcome, RetryReason: string(reason), ErrorClass: errorClass,
			})
			lastErr = doErr
			if retry {
				continue
			}
			return nil, history, doErr
		}

		retry, reason := classifyAttemptStatus(response.StatusCode, policy, request.TaskSubmission, remaining)
		if retry {
			// The response has not been streamed to the downstream client
			// yet, so it is still safe to discard and try another channel.
			_, _ = io.Copy(io.Discard, response.Body)
			_ = response.Body.Close()
			history = append(history, Attempt{
				Number: attemptNumber, ChannelID: channel.ID, RawType: channel.RawType,
				StartedAt: startedAt, CompletedAt: completedAt, Status: response.StatusCode,
				Outcome: AttemptRetried, RetryReason: string(reason),
			})
			continue
		}

		history = append(history, Attempt{
			Number: attemptNumber, ChannelID: channel.ID, RawType: channel.RawType,
			StartedAt: startedAt, CompletedAt: completedAt, Status: response.StatusCode,
			Outcome: AttemptCommitted,
		})
		return response, history, nil
	}

	if lastErr == nil {
		lastErr = ErrUpstreamUnavailable
	}
	return nil, history, lastErr
}

// classifyAttemptError decides whether a transport-level failure is
// retryable and returns a sanitized error class safe to persist. ctx is the
// caller's original request context: if it is already canceled or expired,
// retrying cannot produce a response anyone will receive, so the failure is
// never retried regardless of the policy.
func classifyAttemptError(ctx context.Context, err error, wrote, taskSubmission, attemptsRemaining bool) (retry bool, reason RetryReason, errorClass string) {
	errorClass = classifyErrorClass(err)
	if !attemptsRemaining || ctx.Err() != nil {
		return false, RetryReasonNone, errorClass
	}
	if !wrote {
		return true, RetryReasonTransportBeforeSend, errorClass
	}
	if taskSubmission {
		return false, RetryReasonNone, errorClass
	}
	return true, RetryReasonTransportUncertain, errorClass
}

// classifyAttemptStatus decides whether a received upstream status code is
// retryable. A task submission is never retried here either: once headers
// were received, the upstream already responded to (and therefore is
// presumed to have accepted) the submission.
func classifyAttemptStatus(status int, policy RetryPolicy, taskSubmission, attemptsRemaining bool) (retry bool, reason RetryReason) {
	if !attemptsRemaining || taskSubmission {
		return false, RetryReasonNone
	}
	if policy.statusRetryable(status) {
		return true, RetryReasonUpstreamStatus
	}
	return false, RetryReasonNone
}

// classifyErrorClass reduces an arbitrary transport error to a small, fixed
// vocabulary. It must never derive the class from err.Error(), because that
// text can embed a channel URL, upstream response fragment, or other value
// this package must never surface in logs or persisted attempt records.
func classifyErrorClass(err error) string {
	switch {
	case err == nil:
		return ""
	case errors.Is(err, context.Canceled):
		return "context_canceled"
	case errors.Is(err, context.DeadlineExceeded):
		return "context_deadline_exceeded"
	case errors.Is(err, ErrUpstreamUnavailable):
		return "transport_unavailable"
	default:
		return "transport_error"
	}
}
