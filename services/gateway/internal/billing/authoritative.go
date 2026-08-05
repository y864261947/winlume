package billing

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"

	"winlume/services/gateway/internal/pricing"
	"winlume/services/gateway/internal/relay"
	"winlume/services/gateway/internal/storage"
	"winlume/services/gateway/internal/usage"
)

const authoritativePersistenceTimeout = 5 * time.Second

// AuthoritativeRepository is intentionally narrow: one storage transaction
// owns every hold, settlement, reversal, and idempotency decision.
type AuthoritativeRepository interface {
	Reserve(context.Context, storage.ReservationRequest) (storage.Reservation, error)
	PersistCompletion(context.Context, storage.CompletionSnapshot) error
	Settle(context.Context, uuid.UUID) (storage.Settlement, error)
	Reverse(context.Context, uuid.UUID) error
}

// AuthoritativeService is enabled only after the process startup ownership
// gate passes. It freezes the quote before any hold and persists terminal
// usage before asking storage to release/debit that hold.
type AuthoritativeService struct {
	catalog CatalogLoader
	store   AuthoritativeRepository
	engine  pricing.Engine
}

func NewAuthoritativeService(catalog CatalogLoader, store AuthoritativeRepository) *AuthoritativeService {
	return &AuthoritativeService{catalog: catalog, store: store, engine: pricing.NewEngine()}
}

func (service *AuthoritativeService) Begin(ctx context.Context, request BeginRequest) (*Operation, error) {
	if service == nil || service.catalog == nil || service.store == nil || request.Identity.UserID == uuid.Nil || strings.TrimSpace(request.RequestID) == "" || strings.TrimSpace(request.Model) == "" {
		return nil, ErrAuthoritativeUnavailable
	}
	catalog, err := service.catalog.LoadActiveCatalog(ctx)
	if err != nil {
		return nil, ErrAuthoritativeUnavailable
	}
	quote, err := catalog.Quote(pricing.QuoteRequest{
		Model:        request.Model,
		UserGroup:    request.Identity.UserGroup,
		BillingGroup: request.Identity.BillingGroup,
		Estimate:     request.Estimate,
		Request:      request.Request,
	})
	if errors.Is(err, pricing.ErrUnpricedModel) {
		// No catalog entry means no billing operation. This is deliberately not a
		// relay failure: customers must never be charged for an unpriced model.
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	reserved, err := service.engine.Reserve(quote)
	if err != nil {
		return nil, err
	}
	quote.ReservedQuota = reserved
	quoteJSON, err := json.Marshal(quote)
	if err != nil {
		return nil, ErrAuthoritativeUnavailable
	}
	operationID := uuid.New()
	reservation, err := service.store.Reserve(ctx, storage.ReservationRequest{
		OperationID:      operationID,
		RequestID:        request.RequestID,
		IdempotencyKey:   normalizeIdempotencyKey(request.Identity.UserID, request.IdempotencyKey),
		UserID:           request.Identity.UserID,
		OrganizationID:   request.Identity.OrganizationID,
		APIKeyID:         request.Identity.APIKeyID,
		APIKeyUnlimited:  request.Identity.Unlimited,
		APIKeyQuotaLimit: request.Identity.QuotaLimit,
		CatalogVersionID: quote.CatalogVersionID,
		Provider:         strings.TrimSpace(request.Provider),
		Model:            quote.Model,
		ReservedQuota:    reserved,
		PricingQuote:     quoteJSON,
	})
	if err != nil {
		return nil, mapStorageError(err)
	}
	return &Operation{ID: operationID, UsageEventID: reservation.UsageEventID, RequestID: request.RequestID, Identity: request.Identity, Quote: quote}, nil
}

func (service *AuthoritativeService) Complete(ctx context.Context, operation *Operation, actual usage.Canonical, completion relay.Completion) (Result, error) {
	if service == nil || service.store == nil || operation == nil || operation.UsageEventID == uuid.Nil {
		return Result{}, ErrAuthoritativeUnavailable
	}
	settlement, err := service.engine.Settle(operation.Quote, actual)
	if err != nil {
		return Result{}, err
	}
	canonicalUsage, err := json.Marshal(actual)
	if err != nil {
		return Result{}, ErrAuthoritativeUnavailable
	}
	provenance, err := json.Marshal(actual.Fields)
	if err != nil {
		return Result{}, ErrAuthoritativeUnavailable
	}
	completionState := actual.TerminalEvent
	if completionState == "" && !completion.EOF {
		completionState = "incomplete_response"
	}
	billingCtx, cancel := authoritativeContext(ctx)
	defer cancel()
	if err := service.store.PersistCompletion(billingCtx, storage.CompletionSnapshot{
		UsageEventID:    operation.UsageEventID,
		CanonicalUsage:  canonicalUsage,
		UsageProvenance: provenance,
		CompletionState: completionState,
		ActualQuota:     settlement.Charge.Quota,
		InputTokens:     actual.TextInputTokens,
		OutputTokens:    actual.TextOutputTokens,
		TotalTokens:     totalTokens(actual),
		ChannelCost:     settlement.Charge.CostQuota,
		ProfitQuota:     settlement.Charge.ProfitQuota,
	}); err != nil {
		return Result{}, mapStorageError(err)
	}
	settled, err := service.store.Settle(billingCtx, operation.UsageEventID)
	if err != nil {
		return Result{}, mapStorageError(err)
	}
	return Result{ActualQuota: settled.ActualQuota, Delta: settled.ActualQuota - operation.Quote.ReservedQuota}, nil
}

func (service *AuthoritativeService) Fail(ctx context.Context, operation *Operation, _ Failure) error {
	if service == nil || service.store == nil || operation == nil || operation.UsageEventID == uuid.Nil {
		return ErrAuthoritativeUnavailable
	}
	billingCtx, cancel := authoritativeContext(ctx)
	defer cancel()
	return mapStorageError(service.store.Reverse(billingCtx, operation.UsageEventID))
}

func authoritativeContext(parent context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.WithoutCancel(parent), authoritativePersistenceTimeout)
}

func normalizeIdempotencyKey(userID uuid.UUID, raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	// The database only needs equality. Persisting the supplied request header
	// would make an otherwise private client token visible to support tooling.
	return uuid.NewSHA1(userID, []byte("winlume-gateway-idempotency-v1:"+raw)).String()
}

func totalTokens(actual usage.Canonical) int64 {
	return actual.TextInputTokens + actual.TextOutputTokens + actual.CacheReadTokens + actual.CacheWriteTokens + actual.ImageInputTokens + actual.ImageOutputTokens + actual.AudioInputTokens + actual.AudioOutputTokens
}

func mapStorageError(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, storage.ErrInsufficientFunds):
		return ErrInsufficientFunds
	case errors.Is(err, storage.ErrOperationInFlight):
		return ErrOperationInFlight
	case errors.Is(err, storage.ErrOperationAlreadyCompleted):
		return ErrOperationAlreadyCompleted
	default:
		return ErrAuthoritativeUnavailable
	}
}
