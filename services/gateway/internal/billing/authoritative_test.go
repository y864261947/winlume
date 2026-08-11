package billing

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"reizo/services/gateway/internal/identity"
	"reizo/services/gateway/internal/pricing"
	"reizo/services/gateway/internal/relay"
	"reizo/services/gateway/internal/storage"
	"reizo/services/gateway/internal/usage"
)

type authoritativeStoreStub struct {
	reservation   storage.ReservationRequest
	eventID       uuid.UUID
	snapshot      storage.CompletionSnapshot
	calls         []string
	reverseID     uuid.UUID
	relayAttempts []storage.RelayAttemptRecord
	err           error
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

func (stub *authoritativeStoreStub) RecordRelayAttempt(_ context.Context, record storage.RelayAttemptRecord) error {
	stub.calls = append(stub.calls, "record_relay_attempt")
	stub.relayAttempts = append(stub.relayAttempts, record)
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

func TestAuthoritativeRecordPendingWritesASpoolEnvelopeWithTheFinalQuota(t *testing.T) {
	store := &authoritativeStoreStub{eventID: uuid.New()}
	spool := &spoolFake{}
	service := NewAuthoritativeService(catalogLoaderStub{catalog: authoritativeCatalog("model")}, store, WithRecoverySpool(spool))
	operation, err := service.Begin(context.Background(), authoritativeBeginRequest(uuid.New()))
	require.NoError(t, err)

	actual := usage.Canonical{
		TextInputTokens: 100, TextOutputTokens: 20, Complete: true,
		Calls: map[string]int64{}, Fields: map[string]usage.Provenance{"text_input_tokens": usage.Upstream},
	}
	require.NoError(t, service.RecordPending(context.Background(), operation, actual, relay.Completion{EOF: true, StatusCode: 200}))

	require.Len(t, spool.envelopes, 1)
	envelope := spool.envelopes[0]
	require.Equal(t, operation.ID.String(), envelope.OperationID)
	require.Equal(t, operation.UsageEventID.String(), envelope.UsageEventID)
	require.Equal(t, operation.Quote.CatalogVersionID.String(), envelope.CatalogVersionID)
	require.Equal(t, int64(120), envelope.ActualQuota)
	require.True(t, envelope.valid())
}

func TestAuthoritativeRecordPendingWithoutASpoolIsUnavailable(t *testing.T) {
	store := &authoritativeStoreStub{eventID: uuid.New()}
	service := NewAuthoritativeService(catalogLoaderStub{catalog: authoritativeCatalog("model")}, store)
	operation, err := service.Begin(context.Background(), authoritativeBeginRequest(uuid.New()))
	require.NoError(t, err)

	err = service.RecordPending(context.Background(), operation, usage.Canonical{Calls: map[string]int64{}, Fields: map[string]usage.Provenance{}}, relay.Completion{EOF: true})
	require.ErrorIs(t, err, ErrAuthoritativeUnavailable)
}

func TestAuthoritativeRecordAttemptsPersistsSanitizedPerAttemptDiagnostics(t *testing.T) {
	store := &authoritativeStoreStub{eventID: uuid.New()}
	service := NewAuthoritativeService(catalogLoaderStub{catalog: authoritativeCatalog("model")}, store)
	operation, err := service.Begin(context.Background(), authoritativeBeginRequest(uuid.New()))
	require.NoError(t, err)

	startedFirst := time.Now().UTC()
	completedFirst := startedFirst.Add(time.Millisecond)
	startedSecond := completedFirst.Add(time.Millisecond)
	completedSecond := startedSecond.Add(time.Millisecond)
	startedThird := completedSecond.Add(time.Millisecond)
	completedThird := startedThird.Add(time.Millisecond)
	history := relay.AttemptHistory{
		{
			// Pure transport failure: no HTTP response was ever received.
			Number: 1, ChannelID: "channel-a", RawType: 7, StartedAt: startedFirst, CompletedAt: completedFirst,
			Status: 0, Outcome: relay.AttemptRetried, RetryReason: string(relay.RetryReasonTransportBeforeSend),
			ErrorClass: "transport_unavailable",
		},
		{
			// Retried after an upstream 503.
			Number: 2, ChannelID: "channel-b", RawType: 3, StartedAt: startedSecond, CompletedAt: completedSecond,
			Status: 503, Outcome: relay.AttemptRetried, RetryReason: string(relay.RetryReasonUpstreamStatus),
			ErrorClass: "upstream_unavailable",
		},
		{
			// Committed success.
			Number: 3, ChannelID: "channel-c", RawType: 3, StartedAt: startedThird, CompletedAt: completedThird,
			Status: 200, Outcome: relay.AttemptCommitted,
		},
	}

	require.NoError(t, service.RecordAttempts(context.Background(), operation, history))
	require.Len(t, store.relayAttempts, 3)

	first := store.relayAttempts[0]
	require.Equal(t, operation.UsageEventID, first.UsageEventID)
	require.Equal(t, 1, first.AttemptNumber)
	require.Equal(t, "channel-a", first.ChannelID)
	require.Equal(t, 7, first.ProviderType)
	require.Equal(t, "0", first.Status)
	require.Equal(t, "transport_before_send", first.RetryReason)
	require.Equal(t, "transport_unavailable", first.SanitizedErrorClass)
	require.Equal(t, startedFirst, first.StartedAt)
	require.NotNil(t, first.CompletedAt)
	require.Equal(t, completedFirst, *first.CompletedAt)

	second := store.relayAttempts[1]
	require.Equal(t, 2, second.AttemptNumber)
	require.Equal(t, "channel-b", second.ChannelID)
	require.Equal(t, "503", second.Status)
	require.Equal(t, "upstream_status", second.RetryReason)
	require.Equal(t, "upstream_unavailable", second.SanitizedErrorClass)

	third := store.relayAttempts[2]
	require.Equal(t, 3, third.AttemptNumber)
	require.Equal(t, "channel-c", third.ChannelID)
	require.Equal(t, "200", third.Status)
	require.Empty(t, third.RetryReason)
	require.Empty(t, third.SanitizedErrorClass)
}

func TestAuthoritativeRecordAttemptsWithoutAUsageEventIDIsUnavailable(t *testing.T) {
	store := &authoritativeStoreStub{eventID: uuid.New()}
	service := NewAuthoritativeService(catalogLoaderStub{catalog: authoritativeCatalog("model")}, store)
	err := service.RecordAttempts(context.Background(), &Operation{}, relay.AttemptHistory{{Number: 1, ChannelID: "x"}})
	require.ErrorIs(t, err, ErrAuthoritativeUnavailable)
	require.Empty(t, store.relayAttempts)
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
