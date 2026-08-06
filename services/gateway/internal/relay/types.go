package relay

import (
	"context"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/google/uuid"
)

// ReplayableBody opens an independent reader for every relay attempt.
type ReplayableBody interface {
	Open() (io.ReadCloser, error)
	Size() int64
}

// Request is the protocol-neutral input passed to a ChannelSelector and relay.
type Request struct {
	Method                     string
	Family                     string
	URL                        *url.URL
	Headers                    http.Header
	Body                       ReplayableBody
	RequestID                  string
	TrustedUserID              *uuid.UUID
	IncludeNewAPICompatibility bool
	// TaskSubmission marks a request that creates async/queued upstream work
	// (a paid job, render, or generation task) rather than returning its
	// entire result synchronously. Once such a request's bytes have been
	// written to the upstream connection, a transport failure no longer
	// proves the task was not created - retrying could submit the same paid
	// work twice - so retry classification refuses to retry it past that
	// point regardless of the configured retry policy.
	TaskSubmission bool
}

// Channel is one concrete provider relay destination.
type Channel struct {
	ID            string
	Family        string
	BaseURL       *url.URL
	Authorization string
	Headers       http.Header
	RawType       int
}

// AttemptOutcome classifies how one relay attempt ended. It is recorded
// verbatim (never derived from raw error text) so it is always safe to
// persist alongside billing data.
type AttemptOutcome string

const (
	// AttemptCommitted means this attempt's response (whatever its status
	// code) is the one that gets streamed to the downstream client. No
	// further attempt follows it.
	AttemptCommitted AttemptOutcome = "committed"
	// AttemptRetried means this attempt failed in a configured-retryable way
	// and another attempt followed it.
	AttemptRetried AttemptOutcome = "retried"
	// AttemptFailed means this attempt failed in a way that was not
	// retryable (or no attempts remained), and it produced no response to
	// stream to the client.
	AttemptFailed AttemptOutcome = "failed"
)

// Attempt records one channel selection outcome without owning billing state.
// It carries only sanitized, numeric, or enumerated fields - no request body,
// upstream credential, channel URL, or raw error text - so it is always safe
// to log, persist, or hand to a ChannelSelector.
type Attempt struct {
	Number      int
	ChannelID   string
	RawType     int
	StartedAt   time.Time
	CompletedAt time.Time
	// Status is the upstream HTTP status code, or 0 when no response was
	// received (a transport-level failure).
	Status      int
	Outcome     AttemptOutcome
	RetryReason string
	ErrorClass  string
}

type AttemptHistory []Attempt

// ChannelSelector selects a destination without calculating prices or mutating
// billing state.
type ChannelSelector interface {
	Select(context.Context, Request, AttemptHistory) (Channel, error)
}

// Observer receives response bytes before they are written downstream and one
// terminal completion record.
type Observer interface {
	Observe(context.Context, []byte)
	Complete(context.Context, Completion)
}

// Completion describes the terminal response-copy state.
type Completion struct {
	StatusCode         int
	Headers            http.Header
	BytesWritten       int64
	EOF                bool
	Err                error
	ClientDisconnected bool
}
