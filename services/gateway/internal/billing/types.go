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

var ErrShadowUnavailable = errors.New("shadow billing unavailable")

type CatalogLoader interface {
	LoadActiveCatalog(context.Context) (pricing.Catalog, error)
}

type BeginRequest struct {
	RequestID string
	Identity  identity.Identity
	Model     string
	Estimate  usage.Estimate
	Request   pricing.RequestInput
}

type Operation struct {
	ID        uuid.UUID
	RequestID string
	Identity  identity.Identity
	Quote     pricing.Quote
}

type Result struct {
	ActualQuota int64
	Delta       int64
}

type Failure struct {
	Completion relay.Completion
	ErrorClass string
}
