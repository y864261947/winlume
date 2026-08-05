package relay

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"
)

// poolSelector is an in-memory ChannelSelector over multiple channels. It
// refuses any channel already present in AttemptHistory, which is exactly
// the behavior a real multi-channel selector needs so a retry never reuses a
// channel that just failed.
type poolSelector struct {
	mu       sync.Mutex
	channels []Channel
	calls    []AttemptHistory
}

func (selector *poolSelector) Select(_ context.Context, _ Request, history AttemptHistory) (Channel, error) {
	selector.mu.Lock()
	defer selector.mu.Unlock()
	selector.calls = append(selector.calls, append(AttemptHistory(nil), history...))
	used := make(map[string]bool, len(history))
	for _, attempt := range history {
		used[attempt.ChannelID] = true
	}
	for _, channel := range selector.channels {
		if !used[channel.ID] {
			return channel, nil
		}
	}
	return Channel{}, ErrNoChannel
}

func (selector *poolSelector) callHistories() []AttemptHistory {
	selector.mu.Lock()
	defer selector.mu.Unlock()
	return append([]AttemptHistory(nil), selector.calls...)
}

func mustURL(t *testing.T, raw string) *url.URL {
	t.Helper()
	parsed, err := url.Parse(raw)
	require.NoError(t, err)
	return parsed
}

func statusServer(t *testing.T, status int, body string) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.WriteHeader(status)
		_, _ = response.Write([]byte(body))
	}))
	t.Cleanup(server.Close)
	return server
}

// hijackCloseServer fully reads the request body, then closes the raw
// connection without ever writing a response. This reproduces "the request
// was written to the upstream, but no response was ever received" - the
// uncertain-acceptance case a task submission must not retry into.
func hijackCloseServer(t *testing.T) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		_, _ = io.Copy(io.Discard, request.Body)
		hijacker, ok := response.(http.Hijacker)
		if !ok {
			return
		}
		conn, _, err := hijacker.Hijack()
		if err != nil {
			return
		}
		_ = conn.Close()
	}))
	t.Cleanup(server.Close)
	return server
}

// billingCounter is a minimal stand-in for a real Lifecycle used only to
// prove, at the wiring level, that a caller driving Relay ends up invoking
// exactly one terminal call (Complete xor Fail) no matter how many relay
// attempts happened. Relay itself has no knowledge of billing at all - this
// type exists purely in the test to demonstrate the invariant a real caller
// must uphold.
type billingCounter struct {
	beginCalls    int
	completeCalls int
	failCalls     int
}

func (counter *billingCounter) begin()    { counter.beginCalls++ }
func (counter *billingCounter) complete() { counter.completeCalls++ }
func (counter *billingCounter) fail()     { counter.failCalls++ }

// driveOneOperation is what a real caller does: begin the shared billing
// operation once, run the whole retry sequence, and finish with exactly one
// terminal call based on the final outcome.
func driveOneOperation(t *testing.T, client *Client, request Request, policy RetryPolicy) (*http.Response, AttemptHistory, *billingCounter) {
	t.Helper()
	counter := &billingCounter{}
	counter.begin()
	response, history, err := client.Relay(context.Background(), request, policy)
	if err != nil {
		counter.fail()
	} else {
		counter.complete()
	}
	return response, history, counter
}

func TestRetryClassifiesTransportErrorBeforeSendAsAlwaysRetryable(t *testing.T) {
	retry, reason, class := classifyAttemptError(context.Background(), ErrUpstreamUnavailable, false, true, true)
	require.True(t, retry)
	require.Equal(t, RetryReasonTransportBeforeSend, reason)
	require.Equal(t, "transport_unavailable", class)
}

func TestRetryClassifiesTransportErrorAfterSendAsUncertainAndBlocksTaskSubmissions(t *testing.T) {
	retry, reason, _ := classifyAttemptError(context.Background(), ErrUpstreamUnavailable, true, false, true)
	require.True(t, retry)
	require.Equal(t, RetryReasonTransportUncertain, reason)

	retry, reason, _ = classifyAttemptError(context.Background(), ErrUpstreamUnavailable, true, true, true)
	require.False(t, retry)
	require.Equal(t, RetryReasonNone, reason)
}

func TestRetryDoesNotRetryWhenNoAttemptsRemain(t *testing.T) {
	retry, reason, _ := classifyAttemptError(context.Background(), ErrUpstreamUnavailable, false, false, false)
	require.False(t, retry)
	require.Equal(t, RetryReasonNone, reason)
}

func TestRetryDoesNotRetryAfterTheCallerContextIsAlreadyDone(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	retry, _, _ := classifyAttemptError(ctx, ErrUpstreamUnavailable, false, false, true)
	require.False(t, retry)
}

func TestRetryClassifiesUpstreamStatusOnlyWhenConfigured(t *testing.T) {
	policy := RetryPolicy{RetryableStatuses: map[int]struct{}{http.StatusServiceUnavailable: {}}}
	retry, reason := classifyAttemptStatus(http.StatusServiceUnavailable, policy, false, true)
	require.True(t, retry)
	require.Equal(t, RetryReasonUpstreamStatus, reason)

	retry, _ = classifyAttemptStatus(http.StatusNotFound, policy, false, true)
	require.False(t, retry)

	retry, _ = classifyAttemptStatus(http.StatusServiceUnavailable, policy, true, true)
	require.False(t, retry, "a task submission must not retry even a configured-retryable status")

	retry, _ = classifyAttemptStatus(http.StatusServiceUnavailable, policy, false, false)
	require.False(t, retry, "no retry once attempts are exhausted")
}

func TestClassifyErrorClassNeverLeaksRawErrorText(t *testing.T) {
	rawWithSecrets := errors.New("dial tcp secret-channel.example:443: connection refused, credential=abc123")
	require.Equal(t, "transport_error", classifyErrorClass(rawWithSecrets))
	require.Equal(t, "transport_unavailable", classifyErrorClass(errors.Join(ErrUpstreamUnavailable, rawWithSecrets)))
	require.Equal(t, "context_canceled", classifyErrorClass(context.Canceled))
	require.Equal(t, "context_deadline_exceeded", classifyErrorClass(context.DeadlineExceeded))
}

func TestRelayRetriesAcrossChannelsUntilSuccessAndSharesOneBillingOperation(t *testing.T) {
	unreachable := mustURL(t, "http://127.0.0.1:1")
	unavailable := statusServer(t, http.StatusServiceUnavailable, "")
	succeeding := statusServer(t, http.StatusOK, "ok")

	selector := &poolSelector{channels: []Channel{
		{ID: "broken", Family: "openai", BaseURL: unreachable, RawType: 1},
		{ID: "five-oh-three", Family: "openai", BaseURL: mustURL(t, unavailable.URL), RawType: 2},
		{ID: "healthy", Family: "openai", BaseURL: mustURL(t, succeeding.URL), RawType: 3},
	}}
	client := NewClient(selector, ClientOptions{})
	request := Request{Method: http.MethodGet, Family: "openai", URL: &url.URL{Path: "/v1/models"}}
	policy := RetryPolicy{MaxAttempts: 3, RetryableStatuses: map[int]struct{}{http.StatusServiceUnavailable: {}}}

	response, history, counter := driveOneOperation(t, client, request, policy)
	require.NotNil(t, response)
	defer response.Body.Close()
	require.Equal(t, http.StatusOK, response.StatusCode)
	body, err := io.ReadAll(response.Body)
	require.NoError(t, err)
	require.Equal(t, "ok", string(body))

	require.Len(t, history, 3)
	require.Equal(t, "broken", history[0].ChannelID)
	require.Equal(t, AttemptRetried, history[0].Outcome)
	require.Equal(t, RetryReasonTransportBeforeSend, RetryReason(history[0].RetryReason))
	require.Equal(t, 1, history[0].Number)

	require.Equal(t, "five-oh-three", history[1].ChannelID)
	require.Equal(t, AttemptRetried, history[1].Outcome)
	require.Equal(t, RetryReasonUpstreamStatus, RetryReason(history[1].RetryReason))
	require.Equal(t, http.StatusServiceUnavailable, history[1].Status)
	require.Equal(t, 2, history[1].Number)

	require.Equal(t, "healthy", history[2].ChannelID)
	require.Equal(t, AttemptCommitted, history[2].Outcome)
	require.Equal(t, http.StatusOK, history[2].Status)
	require.Equal(t, 3, history[2].Number)

	// The selector must have seen a strictly growing AttemptHistory so a
	// real multi-channel selector can refuse channels already tried.
	calls := selector.callHistories()
	require.Len(t, calls, 3)
	require.Len(t, calls[0], 0)
	require.Len(t, calls[1], 1)
	require.Len(t, calls[2], 2)

	// Exactly one terminal billing call happened across all three attempts.
	require.Equal(t, 1, counter.beginCalls)
	require.Equal(t, 1, counter.completeCalls)
	require.Equal(t, 0, counter.failCalls)
}

func TestRelayRefundsOnceAfterAllAttemptsFail(t *testing.T) {
	// Both channels are transport failures (never produce an http.Response
	// at all), which is the only case that surfaces as a Go error from
	// Relay - a final retryable *status* still produces a response to
	// stream, and is exercised separately below.
	unreachable := mustURL(t, "http://127.0.0.1:1")
	selector := &poolSelector{channels: []Channel{
		{ID: "first", Family: "openai", BaseURL: unreachable},
		{ID: "second", Family: "openai", BaseURL: unreachable},
	}}
	client := NewClient(selector, ClientOptions{})
	request := Request{Method: http.MethodGet, Family: "openai", URL: &url.URL{Path: "/v1/models"}}
	policy := RetryPolicy{MaxAttempts: 2}

	response, history, counter := driveOneOperation(t, client, request, policy)
	require.Nil(t, response)
	require.Len(t, history, 2)
	require.Equal(t, AttemptRetried, history[0].Outcome)
	require.Equal(t, AttemptFailed, history[1].Outcome)
	require.Equal(t, RetryReasonNone, RetryReason(history[1].RetryReason))

	// Exactly one terminal billing call (a refund/Fail), never two, even
	// though two relay attempts happened.
	require.Equal(t, 1, counter.beginCalls)
	require.Equal(t, 0, counter.completeCalls)
	require.Equal(t, 1, counter.failCalls)
}

func TestRelayCommitsAFinalRetryableStatusOnceAttemptsAreExhausted(t *testing.T) {
	// Unlike a transport failure, a retryable *status* still produced an
	// upstream response. Once attempts are exhausted that response is the
	// best the gateway has, so it is the committed response streamed to the
	// client (and billed as Complete, not Fail) rather than a Go error.
	first := statusServer(t, http.StatusServiceUnavailable, "")
	second := statusServer(t, http.StatusServiceUnavailable, "")
	selector := &poolSelector{channels: []Channel{
		{ID: "first", Family: "openai", BaseURL: mustURL(t, first.URL)},
		{ID: "second", Family: "openai", BaseURL: mustURL(t, second.URL)},
	}}
	client := NewClient(selector, ClientOptions{})
	request := Request{Method: http.MethodGet, Family: "openai", URL: &url.URL{Path: "/v1/models"}}
	policy := RetryPolicy{MaxAttempts: 2, RetryableStatuses: map[int]struct{}{http.StatusServiceUnavailable: {}}}

	response, history, counter := driveOneOperation(t, client, request, policy)
	require.NotNil(t, response)
	defer response.Body.Close()
	require.Equal(t, http.StatusServiceUnavailable, response.StatusCode)
	require.Len(t, history, 2)
	require.Equal(t, AttemptRetried, history[0].Outcome)
	require.Equal(t, AttemptCommitted, history[1].Outcome)
	require.Equal(t, 1, counter.completeCalls)
	require.Equal(t, 0, counter.failCalls)
}

func TestRelayStopsRetryingOnceTheDownstreamResponseWouldBeCommitted(t *testing.T) {
	// A 404 is not in the retryable status set, so it must be treated as the
	// final, committed response - even though it is itself a failure status
	// - and no further attempt (and no second channel) may be used.
	notFound := statusServer(t, http.StatusNotFound, "")
	neverUsed := statusServer(t, http.StatusOK, "should not be called")
	selector := &poolSelector{channels: []Channel{
		{ID: "not-found", Family: "openai", BaseURL: mustURL(t, notFound.URL)},
		{ID: "unused", Family: "openai", BaseURL: mustURL(t, neverUsed.URL)},
	}}
	client := NewClient(selector, ClientOptions{})
	request := Request{Method: http.MethodGet, Family: "openai", URL: &url.URL{Path: "/v1/models"}}
	policy := RetryPolicy{MaxAttempts: 3, RetryableStatuses: map[int]struct{}{http.StatusServiceUnavailable: {}}}

	response, history, counter := driveOneOperation(t, client, request, policy)
	require.NotNil(t, response)
	defer response.Body.Close()
	require.Equal(t, http.StatusNotFound, response.StatusCode)
	require.Len(t, history, 1)
	require.Equal(t, AttemptCommitted, history[0].Outcome)
	require.Equal(t, 1, counter.completeCalls)
	require.Equal(t, 0, counter.failCalls)
}

func TestRelayDoesNotRetryATaskSubmissionAfterUncertainUpstreamAcceptance(t *testing.T) {
	hijacked := hijackCloseServer(t)
	neverUsed := statusServer(t, http.StatusOK, "should not be called")
	selector := &poolSelector{channels: []Channel{
		{ID: "hijacked", Family: "task", BaseURL: mustURL(t, hijacked.URL)},
		{ID: "unused", Family: "task", BaseURL: mustURL(t, neverUsed.URL)},
	}}
	client := NewClient(selector, ClientOptions{})
	request := Request{
		Method: http.MethodPost, Family: "task", URL: &url.URL{Path: "/v1/tasks"},
		Body: &memoryReplayBody{payload: []byte(`{"prompt":"render"}`)}, TaskSubmission: true,
	}
	policy := DefaultRetryPolicy()

	response, history, counter := driveOneOperation(t, client, request, policy)
	require.Nil(t, response)
	require.Len(t, history, 1, "a task submission must not retry once its bytes reached the upstream")
	require.Equal(t, "hijacked", history[0].ChannelID)
	require.Equal(t, AttemptFailed, history[0].Outcome)
	require.Equal(t, 1, counter.failCalls)
	require.Equal(t, 0, counter.completeCalls)
}

func TestRelayDoesRetryATaskSubmissionWhenTheRequestNeverReachedUpstream(t *testing.T) {
	unreachable := mustURL(t, "http://127.0.0.1:1")
	succeeding := statusServer(t, http.StatusOK, "accepted")
	selector := &poolSelector{channels: []Channel{
		{ID: "unreachable", Family: "task", BaseURL: unreachable},
		{ID: "healthy", Family: "task", BaseURL: mustURL(t, succeeding.URL)},
	}}
	client := NewClient(selector, ClientOptions{})
	request := Request{
		Method: http.MethodPost, Family: "task", URL: &url.URL{Path: "/v1/tasks"},
		Body: &memoryReplayBody{payload: []byte(`{"prompt":"render"}`)}, TaskSubmission: true,
	}
	policy := DefaultRetryPolicy()

	response, history, counter := driveOneOperation(t, client, request, policy)
	require.NotNil(t, response)
	defer response.Body.Close()
	require.Len(t, history, 2)
	require.Equal(t, RetryReasonTransportBeforeSend, RetryReason(history[0].RetryReason))
	require.Equal(t, 1, counter.completeCalls)
}

func TestRelayDoesNotRetryATaskSubmissionPastAConfiguredRetryableStatus(t *testing.T) {
	unavailable := statusServer(t, http.StatusServiceUnavailable, "")
	neverUsed := statusServer(t, http.StatusOK, "should not be called")
	selector := &poolSelector{channels: []Channel{
		{ID: "unavailable", Family: "task", BaseURL: mustURL(t, unavailable.URL)},
		{ID: "unused", Family: "task", BaseURL: mustURL(t, neverUsed.URL)},
	}}
	client := NewClient(selector, ClientOptions{})
	request := Request{
		Method: http.MethodPost, Family: "task", URL: &url.URL{Path: "/v1/tasks"},
		Body: &memoryReplayBody{payload: []byte(`{"prompt":"render"}`)}, TaskSubmission: true,
	}
	policy := RetryPolicy{MaxAttempts: 3, RetryableStatuses: map[int]struct{}{http.StatusServiceUnavailable: {}}}

	response, history, counter := driveOneOperation(t, client, request, policy)
	require.NotNil(t, response)
	defer response.Body.Close()
	require.Equal(t, http.StatusServiceUnavailable, response.StatusCode)
	require.Len(t, history, 1)
	require.Equal(t, 1, counter.completeCalls)
}
