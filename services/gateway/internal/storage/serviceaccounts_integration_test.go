//go:build integration

package storage

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestServiceAccountLifecycle(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()

	var userID uuid.UUID
	err := store.pool.QueryRow(ctx, `
		INSERT INTO users (username, display_name, is_service_account)
		VALUES ('svc-test-app', 'Test App', true) RETURNING id`).Scan(&userID)
	require.NoError(t, err)

	var apiKeyID uuid.UUID
	err = store.pool.QueryRow(ctx, `
		INSERT INTO api_keys (user_id, name, key_prefix, key_hash)
		VALUES ($1, 'seed key', 'wl_test', 'deadbeef') RETURNING id`, userID).Scan(&apiKeyID)
	require.NoError(t, err)

	list, err := store.ListServiceAccounts(ctx)
	require.NoError(t, err)
	require.Len(t, list, 1)
	require.Equal(t, apiKeyID, list[0].APIKeyID)
	require.Equal(t, "default", list[0].BillingGroup)
	require.False(t, list[0].Unlimited)
	require.Nil(t, list[0].QuotaLimit)
	require.Equal(t, int64(0), list[0].TotalSpentMicrocredits)

	limit := int64(500000)
	updated, err := store.UpdateServiceAccountPolicy(ctx, apiKeyID, UpdateServiceAccountPolicyInput{
		BillingGroup: "internal-apps",
		Unlimited:    false,
		QuotaLimit:   &limit,
	})
	require.NoError(t, err)
	require.Equal(t, "internal-apps", updated.BillingGroup)
	require.NotNil(t, updated.QuotaLimit)
	require.Equal(t, limit, *updated.QuotaLimit)

	require.NoError(t, store.RevokeServiceAccountKey(ctx, apiKeyID))
	list, err = store.ListServiceAccounts(ctx)
	require.NoError(t, err)
	require.Equal(t, "revoked", list[0].APIKeyStatus)

	require.ErrorIs(t, store.RevokeServiceAccountKey(ctx, uuid.New()), ErrServiceAccountNotFound)
}
