package billing

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/google/uuid"

	"winlume/services/gateway/internal/pricing"
	"winlume/services/gateway/internal/relay"
	"winlume/services/gateway/internal/storage"
	"winlume/services/gateway/internal/usage"
)

type ShadowWriter interface {
	InsertShadow(context.Context, storage.ShadowEvent) (uuid.UUID, error)
}

// Service is the shadow-only lifecycle. It has no funding repository, so it
// cannot debit, reserve, refund, or otherwise mutate customer balances.
type Service struct {
	catalog CatalogLoader
	writer  ShadowWriter
	engine  pricing.Engine
}

func NewShadowService(catalog CatalogLoader, writer ShadowWriter) *Service {
	return &Service{catalog: catalog, writer: writer, engine: pricing.NewEngine()}
}

func (service *Service) Begin(ctx context.Context, request BeginRequest) (*Operation, error) {
	if service == nil || service.catalog == nil || service.writer == nil || request.Identity.UserID == uuid.Nil || strings.TrimSpace(request.RequestID) == "" || strings.TrimSpace(request.Model) == "" {
		return nil, ErrShadowUnavailable
	}
	catalog, err := service.catalog.LoadActiveCatalog(ctx)
	if err != nil {
		return nil, ErrShadowUnavailable
	}
	quote, err := catalog.Quote(pricing.QuoteRequest{
		Model:        request.Model,
		UserGroup:    request.Identity.UserGroup,
		BillingGroup: request.Identity.BillingGroup,
		Estimate:     request.Estimate,
		Request:      request.Request,
	})
	if err != nil {
		return nil, err
	}
	reserved, err := service.engine.Reserve(quote)
	if err != nil {
		return nil, err
	}
	quote.ReservedQuota = reserved
	return &Operation{ID: uuid.New(), RequestID: request.RequestID, Identity: request.Identity, Quote: quote}, nil
}

func (service *Service) Complete(ctx context.Context, operation *Operation, actual usage.Canonical, completion relay.Completion) (Result, error) {
	if service == nil || operation == nil {
		return Result{}, ErrShadowUnavailable
	}
	settlement, err := service.engine.Settle(operation.Quote, actual)
	if err != nil {
		return Result{}, err
	}
	actualQuota := settlement.Charge.Quota
	completedAt := time.Now().UTC()
	event := service.shadowEvent(operation, actual, &actualQuota, &settlement.Delta, completion, "completed", "")
	event.CompletedAt = &completedAt
	if _, err := service.writer.InsertShadow(context.WithoutCancel(ctx), event); err != nil {
		return Result{}, ErrShadowUnavailable
	}
	return Result{ActualQuota: actualQuota, Delta: settlement.Delta}, nil
}

func (service *Service) Fail(ctx context.Context, operation *Operation, failure Failure) error {
	if service == nil || operation == nil {
		return ErrShadowUnavailable
	}
	actual := usage.Canonical{Calls: map[string]int64{}, Fields: map[string]usage.Provenance{}, TerminalEvent: "failed"}
	event := service.shadowEvent(operation, actual, nil, nil, failure.Completion, "failed", sanitizeErrorClass(failure.ErrorClass))
	completedAt := time.Now().UTC()
	event.CompletedAt = &completedAt
	if _, err := service.writer.InsertShadow(context.WithoutCancel(ctx), event); err != nil {
		return ErrShadowUnavailable
	}
	return nil
}

func (service *Service) shadowEvent(operation *Operation, actual usage.Canonical, actualQuota, delta *int64, completion relay.Completion, outcome, errorClass string) storage.ShadowEvent {
	canonicalUsage, _ := json.Marshal(actual)
	provenance, _ := json.Marshal(actual.Fields)
	quote, _ := json.Marshal(operation.Quote)
	completionState := actual.TerminalEvent
	if completionState == "" && !completion.EOF {
		completionState = "incomplete_response"
	}
	return storage.ShadowEvent{
		RequestID:                  operation.RequestID,
		UserID:                     operation.Identity.UserID,
		OrganizationID:             operation.Identity.OrganizationID,
		APIKeyID:                   operation.Identity.APIKeyID,
		CatalogVersionID:           operation.Quote.CatalogVersionID,
		Model:                      operation.Quote.Model,
		CanonicalUsage:             canonicalUsage,
		UsageProvenance:            provenance,
		PricingQuote:               quote,
		CalculatedReservationQuota: operation.Quote.ReservedQuota,
		CalculatedActualQuota:      actualQuota,
		QuotaDelta:                 delta,
		Outcome:                    outcome,
		CompletionState:            completionState,
		SanitizedErrorClass:        errorClass,
	}
}

func sanitizeErrorClass(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" {
		return ""
	}
	for _, runeValue := range value {
		if !(runeValue >= 'a' && runeValue <= 'z' || runeValue >= '0' && runeValue <= '9' || runeValue == '_' || runeValue == '-') {
			return "billing_error"
		}
	}
	if len(value) > 128 {
		return "billing_error"
	}
	return value
}

// Observer adapts normalized usage to the relay transport's observer API.
// Any parsing failure becomes a sanitized failed shadow event after bytes have
// already been delivered to the client.
type Observer struct {
	service   Lifecycle
	operation *Operation
	usage     usage.Observer
}

func NewObserver(service Lifecycle, operation *Operation, observer usage.Observer) *Observer {
	if service == nil || operation == nil || observer == nil {
		return nil
	}
	return &Observer{service: service, operation: operation, usage: observer}
}

func (observer *Observer) Observe(_ context.Context, chunk []byte) {
	_ = observer.usage.Observe(chunk)
}

func (observer *Observer) Complete(ctx context.Context, completion relay.Completion) {
	actual, err := observer.usage.Complete(usage.Completion{
		StatusCode: completion.StatusCode, Headers: completion.Headers, BytesWritten: completion.BytesWritten,
		EOF: completion.EOF, Err: completion.Err, ClientDisconnected: completion.ClientDisconnected,
	})
	if err != nil {
		_ = observer.service.Fail(ctx, observer.operation, Failure{Completion: completion, ErrorClass: "usage_normalization_failed"})
		return
	}
	_, _ = observer.service.Complete(ctx, observer.operation, actual, completion)
}
