// Package billing owns Gateway request billing lifecycles. Funding mutation is
// intentionally absent from the shadow implementation.
package billing

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"winlume/services/gateway/internal/identity"
	"winlume/services/gateway/internal/pricing"
	"winlume/services/gateway/internal/relay"
	"winlume/services/gateway/internal/usage"
)

var (
	ErrShadowUnavailable         = errors.New("shadow billing unavailable")
	ErrAuthoritativeUnavailable  = errors.New("authoritative billing unavailable")
	ErrInsufficientFunds         = errors.New("insufficient billing quota")
	ErrOperationInFlight         = errors.New("billing operation already in flight")
	ErrOperationAlreadyCompleted = errors.New("billing operation already completed")
)

type CatalogLoader interface {
	LoadActiveCatalog(context.Context) (pricing.Catalog, error)
}

type BeginRequest struct {
	RequestID      string
	IdempotencyKey string
	Provider       string
	Identity       identity.Identity
	Model          string
	Estimate       usage.Estimate
	Request        pricing.RequestInput
}

type Operation struct {
	ID           uuid.UUID
	UsageEventID uuid.UUID
	RequestID    string
	Identity     identity.Identity
	Quote        pricing.Quote
}

type Result struct {
	ActualQuota int64
	Delta       int64
}

type Failure struct {
	Completion relay.Completion
	ErrorClass string
}

// Lifecycle is the one request-scoped billing operation shared by the relay
// transport. Shadow and authoritative implementations deliberately expose the
// same terminal calls so retries can never obtain a second customer hold.
type Lifecycle interface {
	Begin(context.Context, BeginRequest) (*Operation, error)
	Complete(context.Context, *Operation, usage.Canonical, relay.Completion) (Result, error)
	Fail(context.Context, *Operation, Failure) error
}
