//go:build integration

package storage

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// These tests require a real Postgres reachable via DATABASE_URL (or
// TEST_DATABASE_URL) with the go-gateway-billing migrations applied. They are
// not executed in this session: there is no local Postgres or Docker
// available. Run with:
//
//	go -C services/gateway test -tags=integration ./internal/storage -run TestRecovery -v
func recoveryTestStore(t *testing.T) *Store {
	t.Helper()
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		databaseURL = os.Getenv("DATABASE_URL")
	}
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL or DATABASE_URL must be set for integration tests")
	}
	store, err := Open(context.Background(), databaseURL)
	require.NoError(t, err)
	t.Cleanup(store.Close)
	return store
}

func TestRecoveryListSettlementPendingReturnsOldestFirst(t *testing.T) {
	store := recoveryTestStore(t)
	ctx := context.Background()

	first := reserveAndPersistPendingCompletion(t, store, ctx)
	time.Sleep(10 * time.Millisecond)
	second := reserveAndPersistPendingCompletion(t, store, ctx)

	pending, err := store.ListSettlementPending(ctx, 50)
	require.NoError(t, err)

	firstIndex, secondIndex := -1, -1
	for index, item := range pending {
		if item.UsageEventID == first {
			firstIndex = index
		}
		if item.UsageEventID == second {
			secondIndex = index
		}
	}
	require.GreaterOrEqual(t, firstIndex, 0)
	require.GreaterOrEqual(t, secondIndex, 0)
	require.Less(t, firstIndex, secondIndex)
}

func TestRecoveryListSettlementPendingExcludesTerminalEvents(t *testing.T) {
	store := recoveryTestStore(t)
	ctx := context.Background()

	usageEventID := reserveAndPersistPendingCompletion(t, store, ctx)
	_, err := store.Settle(ctx, usageEventID)
	require.NoError(t, err)

	pending, err := store.ListSettlementPending(ctx, 50)
	require.NoError(t, err)
	for _, item := range pending {
		require.NotEqual(t, usageEventID, item.UsageEventID)
	}
}

func TestRecoveryListStaleReservationsOnlyReturnsReservedWithoutSnapshot(t *testing.T) {
	store := recoveryTestStore(t)
	ctx := context.Background()

	staleUserID := uuid.New()
	fundTestWallet(t, store, ctx, staleUserID, 1_000_000)
	reservation, err := store.Reserve(ctx, testReservationRequest(staleUserID))
	require.NoError(t, err)

	// A completed request must never show up as a stale reservation candidate.
	completedUsageEventID := reserveAndPersistPendingCompletion(t, store, ctx)
	_, err = store.Settle(ctx, completedUsageEventID)
	require.NoError(t, err)

	stale, err := store.ListStaleReservations(ctx, time.Now().Add(time.Hour), 50)
	require.NoError(t, err)

	found := false
	for _, item := range stale {
		require.NotEqual(t, completedUsageEventID, item.UsageEventID)
		if item.UsageEventID == reservation.UsageEventID {
			found = true
		}
	}
	require.True(t, found, "expected the still-reserved event to be listed as stale once past the cutoff")
}

func TestRecoveryReverseNeverUndoesACommittedSettlement(t *testing.T) {
	store := recoveryTestStore(t)
	ctx := context.Background()

	usageEventID := reserveAndPersistPendingCompletion(t, store, ctx)
	_, err := store.Settle(ctx, usageEventID)
	require.NoError(t, err)

	err = store.Reverse(ctx, usageEventID)
	require.ErrorIs(t, err, ErrOperationAlreadyCompleted)
}

func TestRecoveryReplayingTheSamePersistCompletionTwiceDoesNotDoubleSettle(t *testing.T) {
	store := recoveryTestStore(t)
	ctx := context.Background()

	userID := uuid.New()
	fundTestWallet(t, store, ctx, userID, 1_000_000)
	reservation, err := store.Reserve(ctx, testReservationRequest(userID))
	require.NoError(t, err)

	snapshot := testCompletionSnapshot(reservation.UsageEventID, 100)
	require.NoError(t, store.PersistCompletion(ctx, snapshot))
	require.NoError(t, store.PersistCompletion(ctx, snapshot)) // spool replay simulation

	settlementA, err := store.Settle(ctx, reservation.UsageEventID)
	require.NoError(t, err)
	settlementB, err := store.Settle(ctx, reservation.UsageEventID)
	require.NoError(t, err)
	require.Equal(t, settlementA.ActualQuota, settlementB.ActualQuota)
	require.Equal(t, "settled", settlementB.Status)
}

func reserveAndPersistPendingCompletion(t *testing.T, store *Store, ctx context.Context) uuid.UUID {
	t.Helper()
	userID := uuid.New()
	fundTestWallet(t, store, ctx, userID, 1_000_000)
	reservation, err := store.Reserve(ctx, testReservationRequest(userID))
	require.NoError(t, err)
	require.NoError(t, store.PersistCompletion(ctx, testCompletionSnapshot(reservation.UsageEventID, 100)))
	return reservation.UsageEventID
}

func testReservationRequest(userID uuid.UUID) ReservationRequest {
	return ReservationRequest{
		OperationID:      uuid.New(),
		RequestID:        uuid.NewString(),
		UserID:           userID,
		CatalogVersionID: uuid.New(),
		Provider:         "openai",
		Model:            "model",
		ReservedQuota:    500,
		PricingQuote:     json.RawMessage(`{"model":"model"}`),
	}
}

func testCompletionSnapshot(usageEventID uuid.UUID, actualQuota int64) CompletionSnapshot {
	return CompletionSnapshot{
		UsageEventID:    usageEventID,
		CanonicalUsage:  json.RawMessage(`{"text_input_tokens":10,"text_output_tokens":10,"fields":{}}`),
		UsageProvenance: json.RawMessage(`{}`),
		CompletionState: "message_stop",
		ActualQuota:     actualQuota,
		InputTokens:     10,
		OutputTokens:    10,
		TotalTokens:     20,
	}
}

// fundTestWallet is intentionally minimal: it inserts just enough ledger
// history for Reserve/Settle to find spendable balance for the test user. The
// real schema and wallet creation SQL live in the migrations under drizzle/.
func fundTestWallet(t *testing.T, store *Store, ctx context.Context, userID uuid.UUID, amount int64) {
	t.Helper()
	_, err := store.pool.Exec(ctx, `INSERT INTO users (id, username, display_name) VALUES ($1, $2, $2)`, userID, "recovery-"+userID.String())
	require.NoError(t, err)
	var walletID uuid.UUID
	require.NoError(t, store.pool.QueryRow(ctx, `INSERT INTO wallets (user_id) VALUES ($1) RETURNING id`, userID).Scan(&walletID))
	_, err = store.pool.Exec(ctx, `
		INSERT INTO wallet_ledger_entries (wallet_id, entry_type, amount_microcredits, idempotency_key, reference)
		VALUES ($1, 'grant', $2, $3, 'test-fund')`, walletID, amount, uuid.NewString())
	require.NoError(t, err)
}
