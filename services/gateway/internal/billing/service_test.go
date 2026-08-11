package billing

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"reizo/services/gateway/internal/identity"
	"reizo/services/gateway/internal/pricing"
	"reizo/services/gateway/internal/relay"
	"reizo/services/gateway/internal/storage"
	"reizo/services/gateway/internal/usage"
)

type catalogLoaderStub struct{ catalog pricing.Catalog }

func (stub catalogLoaderStub) LoadActiveCatalog(context.Context) (pricing.Catalog, error) {
	return stub.catalog, nil
}

type shadowWriterStub struct{ event storage.ShadowEvent }

func (stub *shadowWriterStub) InsertShadow(_ context.Context, event storage.ShadowEvent) (uuid.UUID, error) {
	stub.event = event
	return uuid.New(), nil
}

func TestShadowLifecycleFreezesQuoteAndWritesCalculatedUsage(t *testing.T) {
	userID := uuid.New()
	writer := &shadowWriterStub{}
	service := NewShadowService(catalogLoaderStub{catalog: pricing.Catalog{
		ID:                uuid.New(),
		AlgorithmVersion:  "v1",
		QuotaPerUnit:      decimal.NewFromInt(500_000),
		PreConsumedTokens: 500,
		Rules: []pricing.Rule{{
			ModelKey: "model", Mode: pricing.ModeRatio, ModelRatio: decimal.NewFromInt(1), CompletionRatio: decimal.NewFromInt(1),
		}},
	}}, writer)

	operation, err := service.Begin(context.Background(), BeginRequest{
		RequestID: "request-123", Identity: identity.Identity{UserID: userID}, Model: "model",
		Estimate: usage.Estimate{Model: "model", PromptTokens: 100, MaxOutputTokens: 20},
	})
	require.NoError(t, err)
	require.Equal(t, int64(520), operation.Quote.ReservedQuota)

	result, err := service.Complete(context.Background(), operation, usage.Canonical{
		TextInputTokens: 100, TextOutputTokens: 20, Complete: true,
		Calls: map[string]int64{}, Fields: map[string]usage.Provenance{"text_input_tokens": usage.Upstream},
	}, relay.Completion{EOF: true, StatusCode: 200})
	require.NoError(t, err)
	require.Equal(t, int64(120), result.ActualQuota)
	require.Equal(t, int64(-400), result.Delta)
	require.Equal(t, "completed", writer.event.Outcome)
	require.Equal(t, operation.Quote.CatalogVersionID, writer.event.CatalogVersionID)
	require.Equal(t, int64(520), writer.event.CalculatedReservationQuota)
	require.Equal(t, int64(120), *writer.event.CalculatedActualQuota)
}

// lifecycleStub is a minimal Lifecycle used to test Observer's error-handling
// paths independent of either concrete billing implementation.
type lifecycleStub struct {
	completeErr   error
	failErr       error
	failCalls     int
	completeCalls int
}

func (stub *lifecycleStub) Begin(context.Context, BeginRequest) (*Operation, error) { return nil, nil }

func (stub *lifecycleStub) Complete(context.Context, *Operation, usage.Canonical, relay.Completion) (Result, error) {
	stub.completeCalls++
	return Result{}, stub.completeErr
}

func (stub *lifecycleStub) Fail(context.Context, *Operation, Failure) error {
	stub.failCalls++
	return stub.failErr
}

// lifecycleWithPendingRecorder additionally implements PendingRecorder, the
// way AuthoritativeService does.
type lifecycleWithPendingRecorder struct {
	lifecycleStub
	recordPendingCalls int
	recordPendingErr   error
	lastActual         usage.Canonical
}

func (stub *lifecycleWithPendingRecorder) RecordPending(_ context.Context, _ *Operation, actual usage.Canonical, _ relay.Completion) error {
	stub.recordPendingCalls++
	stub.lastActual = actual
	return stub.recordPendingErr
}

// usageObserverStub is a minimal usage.Observer for exercising Observer's
// error-handling paths without any protocol-specific parsing.
type usageObserverStub struct {
	canonical usage.Canonical
	err       error
}

func (stub usageObserverStub) Observe([]byte) error { return nil }

func (stub usageObserverStub) Complete(usage.Completion) (usage.Canonical, error) {
	return stub.canonical, stub.err
}

func observerUsageRegistry(_ *testing.T, _ string) usage.Observer {
	return usageObserverStub{canonical: usage.Canonical{Calls: map[string]int64{}, Fields: map[string]usage.Provenance{}, Complete: true}}
}

func TestObserverCompleteFallsBackToPendingRecorderWhenCompleteFails(t *testing.T) {
	lifecycle := &lifecycleWithPendingRecorder{lifecycleStub: lifecycleStub{completeErr: ErrAuthoritativeUnavailable}}
	operation := &Operation{ID: uuid.New(), UsageEventID: uuid.New()}
	observer := NewObserver(lifecycle, operation, observerUsageRegistry(t, "model"))
	require.NotNil(t, observer)

	observer.Complete(context.Background(), relay.Completion{EOF: true, StatusCode: 200, BytesWritten: 3})

	require.Equal(t, 1, lifecycle.completeCalls)
	require.Equal(t, 1, lifecycle.recordPendingCalls)
}

func TestObserverCompleteDoesNotCallPendingRecorderWhenCompleteSucceeds(t *testing.T) {
	lifecycle := &lifecycleWithPendingRecorder{}
	operation := &Operation{ID: uuid.New(), UsageEventID: uuid.New()}
	observer := NewObserver(lifecycle, operation, observerUsageRegistry(t, "model"))
	require.NotNil(t, observer)

	observer.Complete(context.Background(), relay.Completion{EOF: true, StatusCode: 200, BytesWritten: 3})

	require.Equal(t, 1, lifecycle.completeCalls)
	require.Equal(t, 0, lifecycle.recordPendingCalls)
}

func TestObserverCompleteToleratesALifecycleWithNoPendingRecorderSupport(t *testing.T) {
	lifecycle := &lifecycleStub{completeErr: ErrAuthoritativeUnavailable}
	operation := &Operation{ID: uuid.New(), UsageEventID: uuid.New()}
	observer := NewObserver(lifecycle, operation, observerUsageRegistry(t, "model"))
	require.NotNil(t, observer)

	require.NotPanics(t, func() {
		observer.Complete(context.Background(), relay.Completion{EOF: true, StatusCode: 200, BytesWritten: 3})
	})
	require.Equal(t, 1, lifecycle.completeCalls)
}
