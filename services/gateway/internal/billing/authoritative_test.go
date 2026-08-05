package billing

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"winlume/services/gateway/internal/identity"
	"winlume/services/gateway/internal/pricing"
	"winlume/services/gateway/internal/relay"
	"winlume/services/gateway/internal/storage"
	"winlume/services/gateway/internal/usage"
)

type authoritativeStoreStub struct {
	reservation storage.ReservationRequest
	eventID     uuid.UUID
	snapshot    storage.CompletionSnapshot
	calls       []string
	reverseID   uuid.UUID
	err         error
}

func (stub *authoritativeStoreStub) Reserve(_ context.Context, request storage.ReservationRequest) (storage.Reservation, error) {
	stub.calls = append(stub.calls, "reserve")
	stub.reservation = request
	if stub.err != nil {
		return storage.Reservation{}, stub.err
	}
	return storage.Reservation{UsageEventID: stub.eventID, FundingKind: storage.FundingWallet, FundingReference: uuid.NewString(), ReservedQuota: request.ReservedQuota}, nil
}

func (stub *authoritativeStoreStub) PersistCompletion(_ context.Context, snapshot storage.CompletionSnapshot) error {
	stub.calls = append(stub.calls, "persist")
	stub.snapshot = snapshot
	return stub.err
}

func (stub *authoritativeStoreStub) Settle(_ context.Context, eventID uuid.UUID) (storage.Settlement, error) {
	stub.calls = append(stub.calls, "settle")
	if stub.err != nil {
		return storage.Settlement{}, stub.err
	}
	return storage.Settlement{UsageEventID: eventID, ActualQuota: 120, Status: "settled"}, nil
}

func (stub *authoritativeStoreStub) Reverse(_ context.Context, eventID uuid.UUID) error {
	stub.calls = append(stub.calls, "reverse")
	stub.reverseID = eventID
	return stub.err
}

func authoritativeCatalog(model string) pricing.Catalog {
	return pricing.Catalog{
		ID:                uuid.New(),
		AlgorithmVersion:  "v1",
		QuotaPerUnit:      decimal.NewFromInt(500_000),
		PreConsumedTokens: 500,
		Rules: []pricing.Rule{{
			ModelKey: model, Mode: pricing.ModeRatio, ModelRatio: decimal.NewFromInt(1), CompletionRatio: decimal.NewFromInt(1),
		}},
	}
}

func authoritativeBeginRequest(userID uuid.UUID) BeginRequest {
	return BeginRequest{
		RequestID: "request-123", IdempotencyKey: "client-token", Provider: "openai", Model: "model",
		Identity: identity.Identity{UserID: userID},
		Estimate: usage.Estimate{Model: "model", PromptTokens: 100, MaxOutputTokens: 20},
	}
}

func TestAuthoritativeLifecycleFreezesQuotePersistsThenSettles(t *testing.T) {
	userID, eventID := uuid.New(), uuid.New()
	store := &authoritativeStoreStub{eventID: eventID}
	service := NewAuthoritativeService(catalogLoaderStub{catalog: authoritativeCatalog("model")}, store)
	operation, err := service.Begin(context.Background(), authoritativeBeginRequest(userID))
	require.NoError(t, err)
	require.NotNil(t, operation)
	require.Equal(t, eventID, operation.UsageEventID)
	require.Equal(t, int64(520), store.reservation.ReservedQuota)
	require.NotContains(t, store.reservation.IdempotencyKey, "client-token")
	require.NotEmpty(t, store.reservation.PricingQuote)

	result, err := service.Complete(context.Background(), operation, usage.Canonical{
		TextInputTokens: 100, TextOutputTokens: 20, Complete: true,
		Calls: map[string]int64{}, Fields: map[string]usage.Provenance{"text_input_tokens": usage.Upstream},
	}, relay.Completion{EOF: true, StatusCode: 200})
	require.NoError(t, err)
	require.Equal(t, int64(120), result.ActualQuota)
	require.Equal(t, int64(-400), result.Delta)
	require.Equal(t, []string{"reserve", "persist", "settle"}, store.calls)
	require.Equal(t, eventID, store.snapshot.UsageEventID)
	require.Equal(t, int64(120), store.snapshot.ActualQuota)
}

func TestAuthoritativeFailureReleasesTheOriginalHold(t *testing.T) {
	store := &authoritativeStoreStub{eventID: uuid.New()}
	service := NewAuthoritativeService(catalogLoaderStub{catalog: authoritativeCatalog("model")}, store)
	operation, err := service.Begin(context.Background(), authoritativeBeginRequest(uuid.New()))
	require.NoError(t, err)
	require.NoError(t, service.Fail(context.Background(), operation, Failure{ErrorClass: "upstream_unavailable"}))
	require.Equal(t, operation.UsageEventID, store.reverseID)
	require.Equal(t, []string{"reserve", "reverse"}, store.calls)
}

func TestAuthoritativeBeginDoesNotChargeUnpricedModels(t *testing.T) {
	store := &authoritativeStoreStub{eventID: uuid.New()}
	service := NewAuthoritativeService(catalogLoaderStub{catalog: authoritativeCatalog("other-model")}, store)
	operation, err := service.Begin(context.Background(), authoritativeBeginRequest(uuid.New()))
	require.NoError(t, err)
	require.Nil(t, operation)
	require.Empty(t, store.calls)
}

func TestAuthoritativeBeginMapsInsufficientFunds(t *testing.T) {
	store := &authoritativeStoreStub{eventID: uuid.New(), err: storage.ErrInsufficientFunds}
	service := NewAuthoritativeService(catalogLoaderStub{catalog: authoritativeCatalog("model")}, store)
	_, err := service.Begin(context.Background(), authoritativeBeginRequest(uuid.New()))
	require.ErrorIs(t, err, ErrInsufficientFunds)

	store.err = errors.New("database unavailable")
	_, err = service.Begin(context.Background(), authoritativeBeginRequest(uuid.New()))
	require.ErrorIs(t, err, ErrAuthoritativeUnavailable)
}
