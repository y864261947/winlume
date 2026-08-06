//go:build integration

package storage

// Real-PostgreSQL integration tests for pricing_admin.go, run against the
// same throwaway schema and migrations as billing_integration_test.go so the
// pricing_catalog_versions lifecycle trigger, the child-draft-only trigger,
// and the single-active partial unique index from
// drizzle/0003_go_gateway_billing.sql are all exercised for real.
//
// Run with:
//
//	go -C services/gateway test -tags=integration ./internal/storage -v -run Pricing

import (
	"context"
	"errors"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"
)

var errInconsistentRead = errors.New("GetCurrentPricing returned an incomplete catalog view")

// newActiveTestCatalog inserts a draft catalog seeded with one group rule and
// one model rule, then activates it directly (bypassing the admin API under
// test) so each test starts from a known, single active catalog.
func newActiveTestCatalog(t *testing.T, store *Store) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	id := newTestCatalogVersion(t, store)

	_, err := store.pool.Exec(ctx, `
		INSERT INTO pricing_group_rules (catalog_version_id, user_group, billing_group, group_ratio)
		VALUES ($1, '', 'default', 1)`, id)
	require.NoError(t, err)

	_, err = store.pool.Exec(ctx, `
		INSERT INTO pricing_model_rules (catalog_version_id, model_key, mode, model_ratio, rule_hash)
		VALUES ($1, 'seed-model', 'ratio', 1, 'seed-hash')`, id)
	require.NoError(t, err)

	// Retire any other active catalog left by a previous test (each test
	// function runs its own newActiveTestCatalog, and this suite reuses one
	// shared pool/schema per billingTestStore), then activate this one.
	_, err = store.pool.Exec(ctx, `UPDATE pricing_catalog_versions SET state = 'retired' WHERE state = 'active'`)
	require.NoError(t, err)
	_, err = store.pool.Exec(ctx, `UPDATE pricing_catalog_versions SET state = 'active', activated_at = now() WHERE id = $1`, id)
	require.NoError(t, err)
	return id
}

func countActiveCatalogs(t *testing.T, store *Store) int {
	t.Helper()
	var count int
	require.NoError(t, store.pool.QueryRow(context.Background(),
		`SELECT count(*) FROM pricing_catalog_versions WHERE state = 'active'`).Scan(&count))
	return count
}

func catalogState(t *testing.T, store *Store, id uuid.UUID) string {
	t.Helper()
	var state string
	require.NoError(t, store.pool.QueryRow(context.Background(),
		`SELECT state FROM pricing_catalog_versions WHERE id = $1`, id).Scan(&state))
	return state
}

func TestReplaceGroupRulesLeavesModelRulesUnchanged(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	oldID := newActiveTestCatalog(t, store)

	newID, err := store.ReplaceGroupRules(ctx, []GroupRuleInput{
		{UserGroup: "", BillingGroup: "default", GroupRatio: decimal.NewFromFloat(1.25)},
		{UserGroup: "vip", BillingGroup: "premium", GroupRatio: decimal.NewFromFloat(0.5)},
	})
	require.NoError(t, err)
	require.NotEqual(t, oldID, newID)

	require.Equal(t, "retired", catalogState(t, store, oldID))
	require.Equal(t, "active", catalogState(t, store, newID))
	require.Equal(t, 1, countActiveCatalogs(t, store))

	groupRules, modelRules, err := store.GetCurrentPricing(ctx)
	require.NoError(t, err)
	require.Len(t, groupRules, 2)
	require.Len(t, modelRules, 1)
	require.Equal(t, "seed-model", modelRules[0].ModelKey)
	require.NotEqual(t, oldID, modelRules[0].CatalogVersionID)
}

func TestReplaceModelRulesLeavesGroupRulesUnchanged(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	oldID := newActiveTestCatalog(t, store)

	ratio := decimal.NewFromFloat(3.0)
	newID, err := store.ReplaceModelRules(ctx, []ModelRuleInput{
		{ModelKey: "gpt-quick-edit", Mode: "ratio", ModelRatio: &ratio},
	})
	require.NoError(t, err)
	require.NotEqual(t, oldID, newID)

	require.Equal(t, "retired", catalogState(t, store, oldID))
	require.Equal(t, "active", catalogState(t, store, newID))
	require.Equal(t, 1, countActiveCatalogs(t, store))

	groupRules, modelRules, err := store.GetCurrentPricing(ctx)
	require.NoError(t, err)
	require.Len(t, groupRules, 1)
	require.Equal(t, "default", groupRules[0].BillingGroup)
	require.NotEqual(t, oldID, groupRules[0].CatalogVersionID)
	require.Len(t, modelRules, 1)
	require.Equal(t, "gpt-quick-edit", modelRules[0].ModelKey)
}

func TestReplaceGroupRulesValidationFailureLeavesActiveCatalogUntouched(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	oldID := newActiveTestCatalog(t, store)

	_, err := store.ReplaceGroupRules(ctx, []GroupRuleInput{
		{UserGroup: "", BillingGroup: "", GroupRatio: decimal.NewFromInt(1)},
	})
	require.ErrorIs(t, err, ErrInvalidPricingInput)

	require.Equal(t, "active", catalogState(t, store, oldID))
	require.Equal(t, 1, countActiveCatalogs(t, store))

	groupRules, modelRules, err := store.GetCurrentPricing(ctx)
	require.NoError(t, err)
	require.Len(t, groupRules, 1)
	require.Len(t, modelRules, 1)
	require.Equal(t, oldID, groupRules[0].CatalogVersionID)
}

func TestReplaceModelRulesValidationFailureLeavesActiveCatalogUntouched(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	oldID := newActiveTestCatalog(t, store)

	_, err := store.ReplaceModelRules(ctx, []ModelRuleInput{
		{ModelKey: "no-mode-fields", Mode: "ratio"}, // missing ModelRatio
	})
	require.ErrorIs(t, err, ErrInvalidPricingInput)

	require.Equal(t, "active", catalogState(t, store, oldID))
	require.Equal(t, 1, countActiveCatalogs(t, store))

	groupRules, modelRules, err := store.GetCurrentPricing(ctx)
	require.NoError(t, err)
	require.Len(t, groupRules, 1)
	require.Len(t, modelRules, 1)
	require.Equal(t, oldID, modelRules[0].CatalogVersionID)
}

// TestGetCurrentPricingConsistentUnderConcurrentReplace exercises
// GetCurrentPricing concurrently with a ReplaceGroupRules call: every read
// must see a single, fully-formed catalog (never zero rules from a
// half-applied draft, never two active catalogs), because the FOR UPDATE
// lock in ReplaceGroupRules and the single-active partial unique index
// together guarantee the swap is atomic from any other transaction's view.
func TestGetCurrentPricingConsistentUnderConcurrentReplace(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	newActiveTestCatalog(t, store)

	var wg sync.WaitGroup
	errs := make(chan error, 20)

	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			groupRules, modelRules, err := store.GetCurrentPricing(ctx)
			if err != nil {
				errs <- err
				return
			}
			if len(groupRules) == 0 || len(modelRules) == 0 {
				errs <- errInconsistentRead
			}
		}()
	}

	wg.Add(1)
	go func() {
		defer wg.Done()
		_, err := store.ReplaceGroupRules(ctx, []GroupRuleInput{
			{UserGroup: "", BillingGroup: "default", GroupRatio: decimal.NewFromInt(2)},
		})
		if err != nil {
			errs <- err
		}
	}()

	wg.Wait()
	close(errs)
	for err := range errs {
		require.NoError(t, err)
	}
	require.Equal(t, 1, countActiveCatalogs(t, store))
}
