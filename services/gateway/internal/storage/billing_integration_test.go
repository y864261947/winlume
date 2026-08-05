//go:build integration

package storage

// Real-PostgreSQL integration tests for billing.go - the file that actually
// moves money. Every test here runs Reserve/PersistCompletion/Settle/Reverse
// against a live server so that serializable-transaction behaviour, CHECK
// constraints, unique indexes and the immutability triggers from
// drizzle/0003_go_gateway_billing.sql are all exercised for real.
//
// Run with:
//
//	go -C services/gateway test -tags=integration ./internal/storage -v
//
// The suite provisions its own schema (see billingTestSchema) from the drizzle
// migrations rather than assuming a pre-migrated public schema. That keeps runs
// reproducible and only requires CREATE privilege on one database.

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

const billingTestSchema = "gateway_billing_test"

var (
	billingStoreOnce sync.Once
	billingStore     *Store
	billingStoreErr  error
)

// billingTestStore returns a Store whose pool resolves unqualified table names
// inside a freshly migrated, test-owned schema.
func billingTestStore(t *testing.T) *Store {
	t.Helper()
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		databaseURL = os.Getenv("DATABASE_URL")
	}
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL or DATABASE_URL must be set for integration tests")
	}
	billingStoreOnce.Do(func() { billingStore, billingStoreErr = openBillingTestStore(databaseURL) })
	require.NoError(t, billingStoreErr)
	require.NotNil(t, billingStore)
	return billingStore
}

func openBillingTestStore(databaseURL string) (*Store, error) {
	configuration, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, err
	}
	configuration.MaxConns = 8
	configuration.MinConns = 0
	configuration.ConnConfig.RuntimeParams["search_path"] = billingTestSchema
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(ctx, configuration)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	if err := applyBillingTestMigrations(ctx, pool); err != nil {
		pool.Close()
		return nil, err
	}
	return &Store{pool: pool}, nil
}

func applyBillingTestMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	if _, err := pool.Exec(ctx, `DROP SCHEMA IF EXISTS `+billingTestSchema+` CASCADE`); err != nil {
		return fmt.Errorf("drop schema: %w", err)
	}
	if _, err := pool.Exec(ctx, `CREATE SCHEMA `+billingTestSchema); err != nil {
		return fmt.Errorf("create schema: %w", err)
	}
	migrations := []string{
		"0000_fair_bedlam.sql",
		"0001_yellow_silver_sable.sql",
		"0002_lovely_nightmare.sql",
		"0003_go_gateway_billing.sql",
	}
	for _, name := range migrations {
		path := filepath.Join("..", "..", "..", "..", "drizzle", name)
		raw, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read %s: %w", name, err)
		}
		// The migrations hard-code the "public" schema; retarget them at the
		// throwaway test schema without otherwise altering the DDL, so the
		// constraints and triggers under test are byte-identical to production.
		sql := strings.ReplaceAll(string(raw), `"public"`, `"`+billingTestSchema+`"`)
		for _, statement := range strings.Split(sql, "--> statement-breakpoint") {
			statement = strings.TrimSpace(statement)
			if statement == "" || statement == "BEGIN;" || statement == "COMMIT;" {
				continue
			}
			if _, err := pool.Exec(ctx, statement); err != nil {
				return fmt.Errorf("%s: %w\nstatement: %.200s", name, err, statement)
			}
		}
	}
	return nil
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

func newTestUser(t *testing.T, store *Store) uuid.UUID {
	t.Helper()
	userID := uuid.New()
	_, err := store.pool.Exec(context.Background(),
		`INSERT INTO users (id, username, display_name) VALUES ($1, $2, $2)`, userID, "billing-"+userID.String())
	require.NoError(t, err)
	return userID
}

func newTestCatalogVersion(t *testing.T, store *Store) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, store.pool.QueryRow(context.Background(), `
		INSERT INTO pricing_catalog_versions (
			source_kind, source_instance_label, source_hash, algorithm_version,
			quota_per_unit, pre_consumed_tokens, source_snapshot)
		VALUES ('test', 'integration', $1, 'v1', 500000, 0, '{}'::jsonb)
		RETURNING id`, uuid.NewString()).Scan(&id))
	return id
}

// fundTestWalletFor creates the user's wallet and credits it with amount.
// entry_type must come from the ledger_entry_type enum; 'opening_balance' is
// the schema's own term for a starting credit.
func fundTestWalletFor(t *testing.T, store *Store, userID uuid.UUID, amount int64) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	var walletID uuid.UUID
	require.NoError(t, store.pool.QueryRow(ctx, `INSERT INTO wallets (user_id) VALUES ($1) RETURNING id`, userID).Scan(&walletID))
	if amount != 0 {
		_, err := store.pool.Exec(ctx, `
			INSERT INTO wallet_ledger_entries (wallet_id, entry_type, amount_microcredits, idempotency_key, reference)
			VALUES ($1, 'opening_balance', $2, $3, 'integration-fixture')`, walletID, amount, uuid.NewString())
		require.NoError(t, err)
	}
	return walletID
}

func setFundingPreference(t *testing.T, store *Store, userID uuid.UUID, preference string) {
	t.Helper()
	_, err := store.pool.Exec(context.Background(), `
		INSERT INTO billing_profiles (user_id, funding_preference) VALUES ($1, $2::funding_preference)
		ON CONFLICT (user_id) DO UPDATE SET funding_preference = EXCLUDED.funding_preference`, userID, preference)
	require.NoError(t, err)
}

func newTestAPIKey(t *testing.T, store *Store, userID uuid.UUID, unlimited bool, quotaLimit *int64) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	var apiKeyID uuid.UUID
	require.NoError(t, store.pool.QueryRow(ctx, `
		INSERT INTO api_keys (user_id, name, key_prefix, key_hash)
		VALUES ($1, 'integration', $2, $3) RETURNING id`,
		userID, "wl_"+uuid.NewString()[:8], uuid.NewString()).Scan(&apiKeyID))
	_, err := store.pool.Exec(ctx, `
		INSERT INTO api_key_billing_policies (api_key_id, unlimited, quota_limit) VALUES ($1, $2, $3)`,
		apiKeyID, unlimited, quotaLimit)
	require.NoError(t, err)
	return apiKeyID
}

type subscriptionFixture struct {
	Status             string
	CurrentPeriodEnd   *time.Time
	WindowStartedAt    time.Time
	WindowEndsAt       time.Time
	NextResetAt        time.Time
	WindowLimit        *int64
	WindowConsumed     int64
	CumulativeLimit    *int64
	CumulativeConsumed int64
}

func activeSubscriptionFixture(windowLimit int64) subscriptionFixture {
	now := time.Now().UTC()
	periodEnd := now.Add(30 * 24 * time.Hour)
	return subscriptionFixture{
		Status:           "active",
		CurrentPeriodEnd: &periodEnd,
		WindowStartedAt:  now.Add(-time.Hour),
		WindowEndsAt:     now.Add(29 * 24 * time.Hour),
		NextResetAt:      now.Add(29 * 24 * time.Hour),
		WindowLimit:      &windowLimit,
	}
}

func newTestSubscription(t *testing.T, store *Store, userID uuid.UUID, fixture subscriptionFixture) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	var planID uuid.UUID
	require.NoError(t, store.pool.QueryRow(ctx, `
		INSERT INTO subscription_plans (code, name, price_minor) VALUES ($1, 'Integration Plan', 1000) RETURNING id`,
		"plan-"+uuid.NewString()[:8]).Scan(&planID))
	var subscriptionID uuid.UUID
	require.NoError(t, store.pool.QueryRow(ctx, `
		INSERT INTO subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
		VALUES ($1, $2, $3::subscription_status, now(), $4) RETURNING id`,
		userID, planID, fixture.Status, fixture.CurrentPeriodEnd).Scan(&subscriptionID))
	_, err := store.pool.Exec(ctx, `
		INSERT INTO subscription_quota_states (
			subscription_id, reset_window_started_at, reset_window_ends_at, next_reset_at,
			window_quota_limit, window_quota_consumed, cumulative_quota_limit, cumulative_quota_consumed)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		subscriptionID, fixture.WindowStartedAt, fixture.WindowEndsAt, fixture.NextResetAt,
		fixture.WindowLimit, fixture.WindowConsumed, fixture.CumulativeLimit, fixture.CumulativeConsumed)
	require.NoError(t, err)
	return subscriptionID
}

// ---------------------------------------------------------------------------
// Assertions helpers
// ---------------------------------------------------------------------------

func walletBalanceOf(t *testing.T, store *Store, walletID uuid.UUID) int64 {
	t.Helper()
	var balance int64
	require.NoError(t, store.pool.QueryRow(context.Background(),
		`SELECT COALESCE(SUM(amount_microcredits), 0)::bigint FROM wallet_ledger_entries WHERE wallet_id = $1`, walletID).Scan(&balance))
	return balance
}

func apiKeyLedgerSum(t *testing.T, store *Store, apiKeyID uuid.UUID) int64 {
	t.Helper()
	var delta int64
	require.NoError(t, store.pool.QueryRow(context.Background(),
		`SELECT COALESCE(SUM(quota_delta), 0)::bigint FROM api_key_quota_ledger_entries WHERE api_key_id = $1`, apiKeyID).Scan(&delta))
	return delta
}

func ledgerEntryTypes(t *testing.T, store *Store, table, column string, ownerID uuid.UUID) []string {
	t.Helper()
	rows, err := store.pool.Query(context.Background(),
		fmt.Sprintf(`SELECT entry_type::text FROM %s WHERE %s = $1 ORDER BY created_at, entry_type`, table, column), ownerID)
	require.NoError(t, err)
	defer rows.Close()
	var types []string
	for rows.Next() {
		var entryType string
		require.NoError(t, rows.Scan(&entryType))
		types = append(types, entryType)
	}
	require.NoError(t, rows.Err())
	return types
}

func walletLedgerEntriesForEvent(t *testing.T, store *Store, usageEventID uuid.UUID) int {
	t.Helper()
	var count int
	require.NoError(t, store.pool.QueryRow(context.Background(),
		`SELECT count(*)::int FROM wallet_ledger_entries WHERE usage_event_id = $1`, usageEventID).Scan(&count))
	return count
}

type eventRow struct {
	Status       string
	FundingKind  string
	FundingRef   string
	Reserved     int64
	Actual       *int64
	AttemptCount int
}

func loadEventRow(t *testing.T, store *Store, usageEventID uuid.UUID) eventRow {
	t.Helper()
	var row eventRow
	require.NoError(t, store.pool.QueryRow(context.Background(), `
		SELECT status::text, funding_kind, funding_reference, reserved_quota, actual_quota, settlement_attempt_count
		FROM usage_events WHERE id = $1`, usageEventID).
		Scan(&row.Status, &row.FundingKind, &row.FundingRef, &row.Reserved, &row.Actual, &row.AttemptCount))
	return row
}

func reservationFor(userID, catalogVersionID uuid.UUID, quota int64) ReservationRequest {
	return ReservationRequest{
		OperationID:      uuid.New(),
		RequestID:        uuid.NewString(),
		UserID:           userID,
		CatalogVersionID: catalogVersionID,
		Provider:         "openai",
		Model:            "test-model",
		ReservedQuota:    quota,
		PricingQuote:     json.RawMessage(`{"model":"test-model"}`),
	}
}

func completionFor(usageEventID uuid.UUID, actualQuota int64) CompletionSnapshot {
	return CompletionSnapshot{
		UsageEventID:    usageEventID,
		CanonicalUsage:  json.RawMessage(`{"text_input_tokens":10,"text_output_tokens":10,"fields":{}}`),
		UsageProvenance: json.RawMessage(`{"source":"integration"}`),
		CompletionState: "message_stop",
		ActualQuota:     actualQuota,
		InputTokens:     10,
		OutputTokens:    10,
		TotalTokens:     20,
	}
}

// ---------------------------------------------------------------------------
// Reserve: concurrency and quota gates
// ---------------------------------------------------------------------------

// Two live connections race to reserve against one wallet that can only fund
// one of them. Exactly one must win, and the wallet must never go negative.
func TestReserveConcurrentWalletHoldsAllowOnlyOneOverspender(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	userID := newTestUser(t, store)
	walletID := fundTestWalletFor(t, store, userID, 700)
	setFundingPreference(t, store, userID, "wallet_only")
	catalog := newTestCatalogVersion(t, store)

	type outcome struct {
		reservation Reservation
		err         error
	}
	results := make(chan outcome, 2)
	start := make(chan struct{})
	for index := 0; index < 2; index++ {
		go func() {
			<-start
			reservation, err := store.Reserve(ctx, reservationFor(userID, catalog, 500))
			results <- outcome{reservation, err}
		}()
	}
	close(start)

	succeeded, failed := 0, 0
	for index := 0; index < 2; index++ {
		result := <-results
		if result.err == nil {
			succeeded++
			require.Equal(t, FundingWallet, result.reservation.FundingKind)
			continue
		}
		failed++
		// The loser is rejected either on quota (ErrInsufficientFunds) or, if
		// every bounded serialization retry also conflicts, by PostgreSQL's
		// serializable conflict detection (mapped to ErrUnavailable). Both are
		// safe; what must never happen is a second success.
		require.True(t, result.err == ErrInsufficientFunds || result.err == ErrUnavailable,
			"unexpected error from losing reservation: %v", result.err)
		t.Logf("losing reservation rejected with: %v", result.err)
	}
	require.Equal(t, 1, succeeded, "exactly one concurrent reservation may hold the wallet")
	require.Equal(t, 1, failed)

	balance := walletBalanceOf(t, store, walletID)
	require.Equal(t, int64(200), balance)
	require.GreaterOrEqual(t, balance, int64(0), "wallet spendable balance must never go negative")
}

// Companion to the test above: it discriminates "the loser was rejected on
// quota" from "concurrent reservations against one user always collide". Two
// reservations that both fit must both commit.
//
// This was a KNOWN DEFECT until the bounded serialization retry landed. Reserve
// runs at IsoLevel: Serializable, and pg_advisory_xact_lock does not prevent
// PostgreSQL's SSI machinery from cancelling the second caller: it blocks on
// the lock, reads fresh post-commit data, and is then cancelled as the SSI
// pivot with
//
//	SQLSTATE 40001 "could not serialize access due to read/write dependencies
//	among transactions" (hint: "The transaction might succeed if retried")
//
// raised by the wallet-balance SUM inside reserveWallet. With no retry, every
// such failure mapped to ErrUnavailable and a well-funded user lost one of any
// two concurrent LLM requests to a 5xx-class error. Reserve/Settle/Reverse now
// retry 40001/40P01 in a fresh transaction, so this test asserts both
// reservations commit.
func TestReserveConcurrentReservationsBothSucceedWhenFundsAllow(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	userID := newTestUser(t, store)
	walletID := fundTestWalletFor(t, store, userID, 2_000)
	setFundingPreference(t, store, userID, "wallet_only")
	catalog := newTestCatalogVersion(t, store)

	errs := make(chan error, 2)
	start := make(chan struct{})
	for index := 0; index < 2; index++ {
		go func() {
			<-start
			_, err := store.Reserve(ctx, reservationFor(userID, catalog, 500))
			errs <- err
		}()
	}
	close(start)
	for index := 0; index < 2; index++ {
		require.NoError(t, <-errs)
	}
	require.Equal(t, int64(1_000), walletBalanceOf(t, store, walletID))
}

func TestReserveFailsCleanlyWhenAPIKeyQuotaIsExhausted(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	userID := newTestUser(t, store)
	fundTestWalletFor(t, store, userID, 1_000_000)
	setFundingPreference(t, store, userID, "wallet_only")
	catalog := newTestCatalogVersion(t, store)
	limit := int64(100)
	apiKeyID := newTestAPIKey(t, store, userID, false, &limit)

	request := reservationFor(userID, catalog, 500)
	request.APIKeyID = &apiKeyID
	request.APIKeyQuotaLimit = &limit

	_, err := store.Reserve(ctx, request)
	require.ErrorIs(t, err, ErrInsufficientFunds)
	require.Equal(t, int64(0), apiKeyLedgerSum(t, store, apiKeyID), "no api-key ledger entry may survive a rejected reservation")

	var events int
	require.NoError(t, store.pool.QueryRow(ctx, `SELECT count(*)::int FROM usage_events WHERE operation_id = $1`, request.OperationID.String()).Scan(&events))
	require.Equal(t, 0, events, "the usage event insert must roll back with the reservation")
}

// The API-key hold is written before funding is chosen. When funding fails the
// whole transaction must roll back - no orphan api-key hold, no usage event.
func TestReserveRollsBackAPIKeyHoldWhenFundingFails(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	userID := newTestUser(t, store)
	walletID := fundTestWalletFor(t, store, userID, 10)
	setFundingPreference(t, store, userID, "wallet_only")
	catalog := newTestCatalogVersion(t, store)
	limit := int64(1_000_000)
	apiKeyID := newTestAPIKey(t, store, userID, false, &limit)

	request := reservationFor(userID, catalog, 500)
	request.APIKeyID = &apiKeyID
	request.APIKeyQuotaLimit = &limit

	_, err := store.Reserve(ctx, request)
	require.ErrorIs(t, err, ErrInsufficientFunds)

	require.Equal(t, int64(0), apiKeyLedgerSum(t, store, apiKeyID), "api-key hold must be rolled back when funding fails")
	require.Empty(t, ledgerEntryTypes(t, store, "api_key_quota_ledger_entries", "api_key_id", apiKeyID))
	require.Equal(t, int64(10), walletBalanceOf(t, store, walletID))

	var events int
	require.NoError(t, store.pool.QueryRow(ctx, `SELECT count(*)::int FROM usage_events WHERE operation_id = $1`, request.OperationID.String()).Scan(&events))
	require.Equal(t, 0, events)
}

// usage_events has a unique index on operation_id, so a replayed OperationID is
// a clean conflict rather than a second hold.
func TestReserveWithDuplicateOperationIDIsACleanConflict(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	userID := newTestUser(t, store)
	walletID := fundTestWalletFor(t, store, userID, 10_000)
	setFundingPreference(t, store, userID, "wallet_only")
	catalog := newTestCatalogVersion(t, store)

	request := reservationFor(userID, catalog, 500)
	first, err := store.Reserve(ctx, request)
	require.NoError(t, err)

	replay := request
	replay.RequestID = uuid.NewString()
	second, err := store.Reserve(ctx, replay)
	require.Error(t, err, "a duplicate operation id must not create a second reservation")
	require.Equal(t, uuid.Nil, second.UsageEventID)

	require.Equal(t, int64(9_500), walletBalanceOf(t, store, walletID), "the duplicate must not place a second hold")
	var events int
	require.NoError(t, store.pool.QueryRow(ctx, `SELECT count(*)::int FROM usage_events WHERE operation_id = $1`, request.OperationID.String()).Scan(&events))
	require.Equal(t, 1, events)
	require.Equal(t, "reserved", loadEventRow(t, store, first.UsageEventID).Status)
}

func TestReserveWithReusedIdempotencyKeyReportsInFlightThenCompleted(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	userID := newTestUser(t, store)
	fundTestWalletFor(t, store, userID, 10_000)
	setFundingPreference(t, store, userID, "wallet_only")
	catalog := newTestCatalogVersion(t, store)

	key := uuid.NewString()
	first := reservationFor(userID, catalog, 500)
	first.IdempotencyKey = key
	reservation, err := store.Reserve(ctx, first)
	require.NoError(t, err)

	second := reservationFor(userID, catalog, 500)
	second.IdempotencyKey = key
	_, err = store.Reserve(ctx, second)
	require.ErrorIs(t, err, ErrOperationInFlight)

	require.NoError(t, store.Reverse(ctx, reservation.UsageEventID))

	third := reservationFor(userID, catalog, 500)
	third.IdempotencyKey = key
	_, err = store.Reserve(ctx, third)
	require.ErrorIs(t, err, ErrOperationAlreadyCompleted)
}

// insertWalletLedger/insertAPIKeyLedger short-circuit on a zero delta; prove
// that holds end-to-end and no zero-value ledger row reaches the database
// (which would violate the nonzero-amount CHECK constraints anyway).
func TestReserveWithZeroQuotaWritesNoLedgerEntries(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	userID := newTestUser(t, store)
	walletID := fundTestWalletFor(t, store, userID, 1_000)
	setFundingPreference(t, store, userID, "wallet_only")
	catalog := newTestCatalogVersion(t, store)
	limit := int64(1_000)
	apiKeyID := newTestAPIKey(t, store, userID, false, &limit)

	request := reservationFor(userID, catalog, 0)
	request.APIKeyID = &apiKeyID
	request.APIKeyQuotaLimit = &limit

	reservation, err := store.Reserve(ctx, request)
	require.NoError(t, err)
	require.Equal(t, int64(0), reservation.ReservedQuota)
	require.Equal(t, 0, walletLedgerEntriesForEvent(t, store, reservation.UsageEventID))
	require.Empty(t, ledgerEntryTypes(t, store, "api_key_quota_ledger_entries", "api_key_id", apiKeyID))
	require.Equal(t, int64(1_000), walletBalanceOf(t, store, walletID))

	// A zero-quota settlement must likewise write nothing.
	require.NoError(t, store.PersistCompletion(ctx, completionFor(reservation.UsageEventID, 0)))
	settlement, err := store.Settle(ctx, reservation.UsageEventID)
	require.NoError(t, err)
	require.Equal(t, "settled", settlement.Status)
	require.Equal(t, 0, walletLedgerEntriesForEvent(t, store, reservation.UsageEventID))
	require.Empty(t, ledgerEntryTypes(t, store, "api_key_quota_ledger_entries", "api_key_id", apiKeyID))
	require.Equal(t, int64(1_000), walletBalanceOf(t, store, walletID))
}

// ---------------------------------------------------------------------------
// Funding preference
// ---------------------------------------------------------------------------

func TestReserveFundingPreferenceSubscriptionFirst(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	userID := newTestUser(t, store)
	walletID := fundTestWalletFor(t, store, userID, 10_000)
	subscriptionID := newTestSubscription(t, store, userID, activeSubscriptionFixture(10_000))
	setFundingPreference(t, store, userID, "subscription_first")
	catalog := newTestCatalogVersion(t, store)

	reservation, err := store.Reserve(ctx, reservationFor(userID, catalog, 500))
	require.NoError(t, err)
	require.Equal(t, FundingSubscription, reservation.FundingKind)
	require.Equal(t, subscriptionID.String(), reservation.FundingReference)
	require.Equal(t, int64(10_000), walletBalanceOf(t, store, walletID), "the wallet must stay untouched")
	require.ElementsMatch(t, []string{"hold"}, ledgerEntryTypes(t, store, "subscription_quota_ledger_entries", "subscription_id", subscriptionID))
}

func TestReserveFundingPreferenceWalletFirst(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	userID := newTestUser(t, store)
	walletID := fundTestWalletFor(t, store, userID, 10_000)
	subscriptionID := newTestSubscription(t, store, userID, activeSubscriptionFixture(10_000))
	setFundingPreference(t, store, userID, "wallet_first")
	catalog := newTestCatalogVersion(t, store)

	reservation, err := store.Reserve(ctx, reservationFor(userID, catalog, 500))
	require.NoError(t, err)
	require.Equal(t, FundingWallet, reservation.FundingKind)
	require.Equal(t, walletID.String(), reservation.FundingReference)
	require.Equal(t, int64(9_500), walletBalanceOf(t, store, walletID))
	require.Empty(t, ledgerEntryTypes(t, store, "subscription_quota_ledger_entries", "subscription_id", subscriptionID))
}

func TestReserveFundingPreferenceSubscriptionOnlyNeverFallsBackToWallet(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	userID := newTestUser(t, store)
	walletID := fundTestWalletFor(t, store, userID, 10_000)
	newTestSubscription(t, store, userID, activeSubscriptionFixture(100))
	setFundingPreference(t, store, userID, "subscription_only")
	catalog := newTestCatalogVersion(t, store)

	_, err := store.Reserve(ctx, reservationFor(userID, catalog, 500))
	require.ErrorIs(t, err, ErrInsufficientFunds)
	require.Equal(t, int64(10_000), walletBalanceOf(t, store, walletID))
}

func TestReserveFundingPreferenceWalletOnlyNeverFallsBackToSubscription(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	userID := newTestUser(t, store)
	fundTestWalletFor(t, store, userID, 100)
	subscriptionID := newTestSubscription(t, store, userID, activeSubscriptionFixture(10_000))
	setFundingPreference(t, store, userID, "wallet_only")
	catalog := newTestCatalogVersion(t, store)

	_, err := store.Reserve(ctx, reservationFor(userID, catalog, 500))
	require.ErrorIs(t, err, ErrInsufficientFunds)
	require.Empty(t, ledgerEntryTypes(t, store, "subscription_quota_ledger_entries", "subscription_id", subscriptionID))
}

func TestReserveSkipsInactiveOrExpiredSubscriptions(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	catalog := newTestCatalogVersion(t, store)

	t.Run("cancelled", func(t *testing.T) {
		userID := newTestUser(t, store)
		walletID := fundTestWalletFor(t, store, userID, 10_000)
		fixture := activeSubscriptionFixture(10_000)
		fixture.Status = "cancelled"
		subscriptionID := newTestSubscription(t, store, userID, fixture)
		setFundingPreference(t, store, userID, "subscription_first")

		reservation, err := store.Reserve(ctx, reservationFor(userID, catalog, 500))
		require.NoError(t, err)
		require.Equal(t, FundingWallet, reservation.FundingKind)
		require.Equal(t, int64(9_500), walletBalanceOf(t, store, walletID))
		require.Empty(t, ledgerEntryTypes(t, store, "subscription_quota_ledger_entries", "subscription_id", subscriptionID))
	})

	t.Run("expired period", func(t *testing.T) {
		userID := newTestUser(t, store)
		walletID := fundTestWalletFor(t, store, userID, 10_000)
		fixture := activeSubscriptionFixture(10_000)
		expired := time.Now().UTC().Add(-time.Hour)
		fixture.CurrentPeriodEnd = &expired
		subscriptionID := newTestSubscription(t, store, userID, fixture)
		setFundingPreference(t, store, userID, "subscription_first")

		reservation, err := store.Reserve(ctx, reservationFor(userID, catalog, 500))
		require.NoError(t, err)
		require.Equal(t, FundingWallet, reservation.FundingKind)
		require.Equal(t, int64(9_500), walletBalanceOf(t, store, walletID))
		require.Empty(t, ledgerEntryTypes(t, store, "subscription_quota_ledger_entries", "subscription_id", subscriptionID))
	})
}

func TestReserveBlocksOnWindowQuotaAndFallsBackToWallet(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	userID := newTestUser(t, store)
	walletID := fundTestWalletFor(t, store, userID, 10_000)
	fixture := activeSubscriptionFixture(1_000)
	fixture.WindowConsumed = 900
	subscriptionID := newTestSubscription(t, store, userID, fixture)
	setFundingPreference(t, store, userID, "subscription_first")
	catalog := newTestCatalogVersion(t, store)

	reservation, err := store.Reserve(ctx, reservationFor(userID, catalog, 500))
	require.NoError(t, err)
	require.Equal(t, FundingWallet, reservation.FundingKind, "an exhausted window must fall through to the next funding source")
	require.Equal(t, int64(9_500), walletBalanceOf(t, store, walletID))
	require.Empty(t, ledgerEntryTypes(t, store, "subscription_quota_ledger_entries", "subscription_id", subscriptionID))
}

func TestReserveBlocksOnCumulativeCap(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	userID := newTestUser(t, store)
	walletID := fundTestWalletFor(t, store, userID, 10_000)
	fixture := activeSubscriptionFixture(10_000)
	cumulative := int64(1_000)
	fixture.CumulativeLimit = &cumulative
	fixture.CumulativeConsumed = 900
	subscriptionID := newTestSubscription(t, store, userID, fixture)
	setFundingPreference(t, store, userID, "subscription_first")
	catalog := newTestCatalogVersion(t, store)

	reservation, err := store.Reserve(ctx, reservationFor(userID, catalog, 500))
	require.NoError(t, err)
	require.Equal(t, FundingWallet, reservation.FundingKind, "the cumulative cap must block the subscription even with window room")
	require.Equal(t, int64(9_500), walletBalanceOf(t, store, walletID))
	require.Empty(t, ledgerEntryTypes(t, store, "subscription_quota_ledger_entries", "subscription_id", subscriptionID))
}

// resetSubscriptionWindow rolls the window forward, zeroes consumption with a
// compensating 'reset' ledger entry, and must be a no-op once the new window is
// current.
func TestReserveResetsSubscriptionWindowIdempotently(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	userID := newTestUser(t, store)
	fundTestWalletFor(t, store, userID, 10_000)
	now := time.Now().UTC()
	windowLimit := int64(10_000)
	subscriptionID := newTestSubscription(t, store, userID, subscriptionFixture{
		Status:           "active",
		CurrentPeriodEnd: ptrTime(now.Add(30 * 24 * time.Hour)),
		WindowStartedAt:  now.Add(-40 * 24 * time.Hour),
		WindowEndsAt:     now.Add(-10 * 24 * time.Hour),
		NextResetAt:      now.Add(-10 * 24 * time.Hour),
		WindowLimit:      &windowLimit,
		WindowConsumed:   300,
	})
	setFundingPreference(t, store, userID, "subscription_only")
	catalog := newTestCatalogVersion(t, store)

	reservation, err := store.Reserve(ctx, reservationFor(userID, catalog, 500))
	require.NoError(t, err)
	require.Equal(t, FundingSubscription, reservation.FundingKind)

	var consumed int64
	var nextReset, windowStart time.Time
	require.NoError(t, store.pool.QueryRow(ctx, `
		SELECT window_quota_consumed, next_reset_at, reset_window_started_at
		FROM subscription_quota_states WHERE subscription_id = $1`, subscriptionID).Scan(&consumed, &nextReset, &windowStart))
	require.Equal(t, int64(0), consumed, "the reset must zero window consumption")
	require.True(t, nextReset.After(now), "next_reset_at must advance past now, got %s", nextReset)
	require.ElementsMatch(t, []string{"reset", "hold"}, ledgerEntryTypes(t, store, "subscription_quota_ledger_entries", "subscription_id", subscriptionID))

	// A second reservation is inside the fresh window: no further reset.
	_, err = store.Reserve(ctx, reservationFor(userID, catalog, 500))
	require.NoError(t, err)
	require.ElementsMatch(t, []string{"reset", "hold", "hold"}, ledgerEntryTypes(t, store, "subscription_quota_ledger_entries", "subscription_id", subscriptionID))

	var nextResetAgain, windowStartAgain time.Time
	require.NoError(t, store.pool.QueryRow(ctx, `
		SELECT next_reset_at, reset_window_started_at FROM subscription_quota_states WHERE subscription_id = $1`,
		subscriptionID).Scan(&nextResetAgain, &windowStartAgain))
	require.True(t, nextReset.Equal(nextResetAgain), "window reset must be idempotent")
	require.True(t, windowStart.Equal(windowStartAgain))
}

func ptrTime(value time.Time) *time.Time { return &value }

// ---------------------------------------------------------------------------
// Ledger immutability triggers
// ---------------------------------------------------------------------------

func TestGatewayQuotaLedgerEntriesAreImmutable(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	userID := newTestUser(t, store)
	fundTestWalletFor(t, store, userID, 10_000)
	setFundingPreference(t, store, userID, "wallet_only")
	catalog := newTestCatalogVersion(t, store)
	limit := int64(10_000)
	apiKeyID := newTestAPIKey(t, store, userID, false, &limit)

	request := reservationFor(userID, catalog, 500)
	request.APIKeyID = &apiKeyID
	request.APIKeyQuotaLimit = &limit
	_, err := store.Reserve(ctx, request)
	require.NoError(t, err)

	_, err = store.pool.Exec(ctx, `UPDATE api_key_quota_ledger_entries SET quota_delta = -1 WHERE api_key_id = $1`, apiKeyID)
	require.Error(t, err)
	require.Contains(t, err.Error(), "gateway quota ledger entries are immutable")
	_, err = store.pool.Exec(ctx, `DELETE FROM api_key_quota_ledger_entries WHERE api_key_id = $1`, apiKeyID)
	require.Error(t, err)
	require.Contains(t, err.Error(), "gateway quota ledger entries are immutable")
	require.Equal(t, int64(-500), apiKeyLedgerSum(t, store, apiKeyID), "the hold must survive both mutation attempts")

	subscriptionUserID := newTestUser(t, store)
	subscriptionID := newTestSubscription(t, store, subscriptionUserID, activeSubscriptionFixture(10_000))
	setFundingPreference(t, store, subscriptionUserID, "subscription_only")
	_, err = store.Reserve(ctx, reservationFor(subscriptionUserID, catalog, 500))
	require.NoError(t, err)

	_, err = store.pool.Exec(ctx, `UPDATE subscription_quota_ledger_entries SET quota_delta = 1 WHERE subscription_id = $1`, subscriptionID)
	require.Error(t, err)
	require.Contains(t, err.Error(), "gateway quota ledger entries are immutable")
	_, err = store.pool.Exec(ctx, `DELETE FROM subscription_quota_ledger_entries WHERE subscription_id = $1`, subscriptionID)
	require.Error(t, err)
	require.Contains(t, err.Error(), "gateway quota ledger entries are immutable")
	require.ElementsMatch(t, []string{"hold"}, ledgerEntryTypes(t, store, "subscription_quota_ledger_entries", "subscription_id", subscriptionID))
}

// ---------------------------------------------------------------------------
// Settlement / reversal lifecycle
// ---------------------------------------------------------------------------

func TestReserveThenSettleChargesActualQuotaNotTheReservation(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	userID := newTestUser(t, store)
	walletID := fundTestWalletFor(t, store, userID, 10_000)
	setFundingPreference(t, store, userID, "wallet_only")
	catalog := newTestCatalogVersion(t, store)

	reservation, err := store.Reserve(ctx, reservationFor(userID, catalog, 500))
	require.NoError(t, err)
	require.Equal(t, int64(9_500), walletBalanceOf(t, store, walletID), "hold is a negative wallet delta")

	require.NoError(t, store.PersistCompletion(ctx, completionFor(reservation.UsageEventID, 120)))
	require.Equal(t, "settlement_pending", loadEventRow(t, store, reservation.UsageEventID).Status)

	settlement, err := store.Settle(ctx, reservation.UsageEventID)
	require.NoError(t, err)
	require.Equal(t, "settled", settlement.Status)
	require.Equal(t, int64(120), settlement.ActualQuota)

	require.Equal(t, int64(9_880), walletBalanceOf(t, store, walletID), "net effect must be the actual quota, not the reservation")
	require.ElementsMatch(t, []string{"hold", "release", "debit"}, walletEntryTypesForEvent(t, store, reservation.UsageEventID))
	require.Equal(t, "settled", loadEventRow(t, store, reservation.UsageEventID).Status)
}

func walletEntryTypesForEvent(t *testing.T, store *Store, usageEventID uuid.UUID) []string {
	t.Helper()
	rows, err := store.pool.Query(context.Background(),
		`SELECT entry_type::text FROM wallet_ledger_entries WHERE usage_event_id = $1 ORDER BY created_at, entry_type DESC`, usageEventID)
	require.NoError(t, err)
	defer rows.Close()
	var types []string
	for rows.Next() {
		var entryType string
		require.NoError(t, rows.Scan(&entryType))
		types = append(types, entryType)
	}
	require.NoError(t, rows.Err())
	return types
}

func TestSettleSubscriptionConsumesWindowAndCumulativeQuota(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	userID := newTestUser(t, store)
	fixture := activeSubscriptionFixture(10_000)
	cumulative := int64(50_000)
	fixture.CumulativeLimit = &cumulative
	subscriptionID := newTestSubscription(t, store, userID, fixture)
	setFundingPreference(t, store, userID, "subscription_only")
	catalog := newTestCatalogVersion(t, store)

	reservation, err := store.Reserve(ctx, reservationFor(userID, catalog, 500))
	require.NoError(t, err)
	require.NoError(t, store.PersistCompletion(ctx, completionFor(reservation.UsageEventID, 120)))
	settlement, err := store.Settle(ctx, reservation.UsageEventID)
	require.NoError(t, err)
	require.Equal(t, int64(120), settlement.ActualQuota)

	var windowConsumed, cumulativeConsumed int64
	require.NoError(t, store.pool.QueryRow(ctx, `
		SELECT window_quota_consumed, cumulative_quota_consumed FROM subscription_quota_states WHERE subscription_id = $1`,
		subscriptionID).Scan(&windowConsumed, &cumulativeConsumed))
	require.Equal(t, int64(120), windowConsumed)
	require.Equal(t, int64(120), cumulativeConsumed)
	require.ElementsMatch(t, []string{"hold", "release", "debit"}, ledgerEntryTypes(t, store, "subscription_quota_ledger_entries", "subscription_id", subscriptionID))

	var holds int64
	require.NoError(t, store.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(quota_delta) FILTER (WHERE entry_type IN ('hold','release')), 0)::bigint
		FROM subscription_quota_ledger_entries WHERE subscription_id = $1`, subscriptionID).Scan(&holds))
	require.Equal(t, int64(0), holds, "the hold must be fully released at settlement")
}

func TestSettleAPIKeyBoundedReplacesHoldWithDebit(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	userID := newTestUser(t, store)
	walletID := fundTestWalletFor(t, store, userID, 10_000)
	setFundingPreference(t, store, userID, "wallet_only")
	catalog := newTestCatalogVersion(t, store)
	limit := int64(2_000)
	apiKeyID := newTestAPIKey(t, store, userID, false, &limit)

	request := reservationFor(userID, catalog, 500)
	request.APIKeyID = &apiKeyID
	request.APIKeyQuotaLimit = &limit
	reservation, err := store.Reserve(ctx, request)
	require.NoError(t, err)
	require.Equal(t, int64(-500), apiKeyLedgerSum(t, store, apiKeyID))

	require.NoError(t, store.PersistCompletion(ctx, completionFor(reservation.UsageEventID, 120)))
	_, err = store.Settle(ctx, reservation.UsageEventID)
	require.NoError(t, err)

	require.Equal(t, int64(-120), apiKeyLedgerSum(t, store, apiKeyID), "api-key quota is charged the actual, not the reservation")
	require.ElementsMatch(t, []string{"hold", "release", "debit"}, ledgerEntryTypes(t, store, "api_key_quota_ledger_entries", "api_key_id", apiKeyID))
	require.Equal(t, int64(9_880), walletBalanceOf(t, store, walletID))
}

func TestSettleTwiceIsASafeNoOp(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	userID := newTestUser(t, store)
	walletID := fundTestWalletFor(t, store, userID, 10_000)
	setFundingPreference(t, store, userID, "wallet_only")
	catalog := newTestCatalogVersion(t, store)

	reservation, err := store.Reserve(ctx, reservationFor(userID, catalog, 500))
	require.NoError(t, err)
	require.NoError(t, store.PersistCompletion(ctx, completionFor(reservation.UsageEventID, 120)))

	first, err := store.Settle(ctx, reservation.UsageEventID)
	require.NoError(t, err)
	balanceAfterFirst := walletBalanceOf(t, store, walletID)

	second, err := store.Settle(ctx, reservation.UsageEventID)
	require.NoError(t, err)
	require.Equal(t, first, second)
	require.Equal(t, balanceAfterFirst, walletBalanceOf(t, store, walletID), "a repeated settle must never double-debit")
	require.ElementsMatch(t, []string{"hold", "release", "debit"}, walletEntryTypesForEvent(t, store, reservation.UsageEventID))
}

func TestReverseReleasesTheHoldAndWritesNoDebit(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	userID := newTestUser(t, store)
	walletID := fundTestWalletFor(t, store, userID, 10_000)
	setFundingPreference(t, store, userID, "wallet_only")
	catalog := newTestCatalogVersion(t, store)

	reservation, err := store.Reserve(ctx, reservationFor(userID, catalog, 500))
	require.NoError(t, err)
	require.Equal(t, int64(9_500), walletBalanceOf(t, store, walletID))

	require.NoError(t, store.Reverse(ctx, reservation.UsageEventID))
	require.Equal(t, int64(10_000), walletBalanceOf(t, store, walletID), "a reversal restores the full opening balance")
	require.ElementsMatch(t, []string{"hold", "release"}, walletEntryTypesForEvent(t, store, reservation.UsageEventID))
	require.Equal(t, "reversed", loadEventRow(t, store, reservation.UsageEventID).Status)

	// Reversing again is idempotent.
	require.NoError(t, store.Reverse(ctx, reservation.UsageEventID))
	require.Equal(t, int64(10_000), walletBalanceOf(t, store, walletID))
	require.ElementsMatch(t, []string{"hold", "release"}, walletEntryTypesForEvent(t, store, reservation.UsageEventID))
}

// The single most safety-critical invariant in billing.go: a committed
// settlement can never be un-done.
func TestReverseAfterSettleNeverUndoesTheDebit(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	userID := newTestUser(t, store)
	walletID := fundTestWalletFor(t, store, userID, 10_000)
	setFundingPreference(t, store, userID, "wallet_only")
	catalog := newTestCatalogVersion(t, store)

	reservation, err := store.Reserve(ctx, reservationFor(userID, catalog, 500))
	require.NoError(t, err)
	require.NoError(t, store.PersistCompletion(ctx, completionFor(reservation.UsageEventID, 120)))
	_, err = store.Settle(ctx, reservation.UsageEventID)
	require.NoError(t, err)
	settledBalance := walletBalanceOf(t, store, walletID)

	require.ErrorIs(t, store.Reverse(ctx, reservation.UsageEventID), ErrOperationAlreadyCompleted)
	require.Equal(t, settledBalance, walletBalanceOf(t, store, walletID))
	require.Equal(t, "settled", loadEventRow(t, store, reservation.UsageEventID).Status)
	require.ElementsMatch(t, []string{"hold", "release", "debit"}, walletEntryTypesForEvent(t, store, reservation.UsageEventID))
}

func TestSettleAfterReverseReturnsAlreadyCompleted(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	userID := newTestUser(t, store)
	walletID := fundTestWalletFor(t, store, userID, 10_000)
	setFundingPreference(t, store, userID, "wallet_only")
	catalog := newTestCatalogVersion(t, store)

	reservation, err := store.Reserve(ctx, reservationFor(userID, catalog, 500))
	require.NoError(t, err)
	require.NoError(t, store.Reverse(ctx, reservation.UsageEventID))

	require.ErrorIs(t, store.PersistCompletion(ctx, completionFor(reservation.UsageEventID, 120)), ErrOperationAlreadyCompleted)
	_, err = store.Settle(ctx, reservation.UsageEventID)
	require.ErrorIs(t, err, ErrOperationAlreadyCompleted)
	require.Equal(t, int64(10_000), walletBalanceOf(t, store, walletID))
}

// When the funding source can no longer cover the real cost, settlement parks
// the event in settlement_pending for the recovery worker: the hold stays put,
// the attempt counter advances, and the funding source is never switched.
func TestSettleWithInsufficientFundsParksInSettlementPending(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	userID := newTestUser(t, store)
	walletID := fundTestWalletFor(t, store, userID, 1_000)
	setFundingPreference(t, store, userID, "wallet_only")
	catalog := newTestCatalogVersion(t, store)

	reservation, err := store.Reserve(ctx, reservationFor(userID, catalog, 500))
	require.NoError(t, err)
	require.NoError(t, store.PersistCompletion(ctx, completionFor(reservation.UsageEventID, 1_200)))

	_, err = store.Settle(ctx, reservation.UsageEventID)
	require.ErrorIs(t, err, ErrInsufficientFunds)

	row := loadEventRow(t, store, reservation.UsageEventID)
	require.Equal(t, "settlement_pending", row.Status)
	require.Equal(t, 1, row.AttemptCount)
	require.Equal(t, string(FundingWallet), row.FundingKind)
	require.Equal(t, walletID.String(), row.FundingRef)
	require.ElementsMatch(t, []string{"hold"}, walletEntryTypesForEvent(t, store, reservation.UsageEventID), "the hold must not be released")
	require.Equal(t, int64(500), walletBalanceOf(t, store, walletID))

	// A retry bumps the counter again without touching money.
	_, err = store.Settle(ctx, reservation.UsageEventID)
	require.ErrorIs(t, err, ErrInsufficientFunds)
	require.Equal(t, 2, loadEventRow(t, store, reservation.UsageEventID).AttemptCount)
	require.Equal(t, int64(500), walletBalanceOf(t, store, walletID))
}

// An overage must be charged to whichever source funded the reservation. Even
// when a wallet could comfortably absorb it, settlement never re-selects.
func TestSettleOverageStaysOnTheOriginalFundingSource(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	userID := newTestUser(t, store)
	walletID := fundTestWalletFor(t, store, userID, 1_000_000)
	subscriptionID := newTestSubscription(t, store, userID, activeSubscriptionFixture(1_000))
	setFundingPreference(t, store, userID, "subscription_first")
	catalog := newTestCatalogVersion(t, store)

	reservation, err := store.Reserve(ctx, reservationFor(userID, catalog, 500))
	require.NoError(t, err)
	require.Equal(t, FundingSubscription, reservation.FundingKind)

	// An overage that still fits the subscription window is charged there and
	// leaves the wallet alone.
	require.NoError(t, store.PersistCompletion(ctx, completionFor(reservation.UsageEventID, 800)))
	settlement, err := store.Settle(ctx, reservation.UsageEventID)
	require.NoError(t, err)
	require.Equal(t, int64(800), settlement.ActualQuota)
	require.Equal(t, int64(1_000_000), walletBalanceOf(t, store, walletID), "the wallet must not absorb a subscription overage")

	var windowConsumed int64
	require.NoError(t, store.pool.QueryRow(ctx, `SELECT window_quota_consumed FROM subscription_quota_states WHERE subscription_id = $1`,
		subscriptionID).Scan(&windowConsumed))
	require.Equal(t, int64(800), windowConsumed)

	// A second operation whose overage exceeds the remaining window must park
	// rather than silently switch to the wallet.
	secondReservation, err := store.Reserve(ctx, reservationFor(userID, catalog, 200))
	require.NoError(t, err)
	require.Equal(t, FundingSubscription, secondReservation.FundingKind)
	require.NoError(t, store.PersistCompletion(ctx, completionFor(secondReservation.UsageEventID, 900)))
	_, err = store.Settle(ctx, secondReservation.UsageEventID)
	require.ErrorIs(t, err, ErrInsufficientFunds)

	row := loadEventRow(t, store, secondReservation.UsageEventID)
	require.Equal(t, "settlement_pending", row.Status)
	require.Equal(t, string(FundingSubscription), row.FundingKind)
	require.Equal(t, subscriptionID.String(), row.FundingRef)
	require.Equal(t, int64(1_000_000), walletBalanceOf(t, store, walletID), "settlement must never re-select a funding source")
}

func TestPersistCompletionRequiresAReservedEvent(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	userID := newTestUser(t, store)
	fundTestWalletFor(t, store, userID, 10_000)
	setFundingPreference(t, store, userID, "wallet_only")
	catalog := newTestCatalogVersion(t, store)

	reservation, err := store.Reserve(ctx, reservationFor(userID, catalog, 500))
	require.NoError(t, err)
	snapshot := completionFor(reservation.UsageEventID, 120)
	require.NoError(t, store.PersistCompletion(ctx, snapshot))
	// Replaying the same snapshot on a settlement_pending event is a no-op.
	require.NoError(t, store.PersistCompletion(ctx, snapshot))

	_, err = store.Settle(ctx, reservation.UsageEventID)
	require.NoError(t, err)
	// And on an already-settled event.
	require.NoError(t, store.PersistCompletion(ctx, snapshot))

	unknown := completionFor(uuid.New(), 10)
	require.ErrorIs(t, store.PersistCompletion(ctx, unknown), ErrUnavailable)
}
