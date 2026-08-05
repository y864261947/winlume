package billing

import (
	"context"
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
