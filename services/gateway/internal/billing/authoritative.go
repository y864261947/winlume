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
	spool   RecoverySpool
}

// AuthoritativeOption configures optional AuthoritativeService behavior. It
// exists so new capabilities (like the recovery spool) can be added without
// breaking already-committed NewAuthoritativeService call sites.
type AuthoritativeOption func(*AuthoritativeService)

// WithRecoverySpool attaches the local owner-only recovery spool used when
// Complete cannot even reach Postgres for the pending snapshot. Without this
// option, a database outage during Complete leaves the operation reserved
// until the recovery worker's stale-reservation window reverses it -
// refunding usage that was already generated. With it, the completion is
// durably recorded locally and finished by the recovery worker instead.
func WithRecoverySpool(spool RecoverySpool) AuthoritativeOption {
	return func(service *AuthoritativeService) { service.spool = spool }
}

func NewAuthoritativeService(catalog CatalogLoader, store AuthoritativeRepository, options ...AuthoritativeOption) *AuthoritativeService {
	service := &AuthoritativeService{catalog: catalog, store: store, engine: pricing.NewEngine()}
	for _, option := range options {
		option(service)
	}
	return service
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

// RecordPending durably records operation's actual, catalog-priced usage in
// the local recovery spool. It is the fallback path for Complete failures
// that happen after bytes have already reached the client, when the normal
// response can no longer be changed: rather than silently losing the
// completion (and letting the recovery worker eventually reverse the hold
// as "stale" even though usage was actually generated), the same settlement
// Complete would have persisted is written to disk for the recovery worker
// to finish later. It recomputes settlement.Charge.Quota deterministically
// from operation.Quote and actual, the same inputs Complete already used, so
// it produces the same final quota Complete would have persisted.
func (service *AuthoritativeService) RecordPending(ctx context.Context, operation *Operation, actual usage.Canonical, completion relay.Completion) error {
	if service == nil || service.spool == nil || operation == nil || operation.UsageEventID == uuid.Nil {
		return ErrAuthoritativeUnavailable
	}
	settlement, err := service.engine.Settle(operation.Quote, actual)
	if err != nil {
		return err
	}
	canonicalUsage, err := json.Marshal(actual)
	if err != nil {
		return ErrAuthoritativeUnavailable
	}
	completionState := actual.TerminalEvent
	if completionState == "" && !completion.EOF {
		completionState = "incomplete_response"
	}
	envelope := RecoveryEnvelope{
		OperationID:      operation.ID.String(),
		UsageEventID:     operation.UsageEventID.String(),
		CatalogVersionID: operation.Quote.CatalogVersionID.String(),
		CanonicalUsage:   canonicalUsage,
		ActualQuota:      settlement.Charge.Quota,
		CompletionState:  completionState,
	}
	envelope.Checksum = envelope.checksum()
	spoolCtx, cancel := authoritativeContext(ctx)
	defer cancel()
	return service.spool.Write(spoolCtx, envelope)
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
