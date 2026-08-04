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

// Attempt records one channel selection outcome without owning billing state.
type Attempt struct {
	ChannelID string
	StartedAt time.Time
	Status    int
	ErrorCode string
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
