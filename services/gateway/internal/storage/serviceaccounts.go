package storage

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// ErrServiceAccountNotFound is returned when an admin mutation targets an
// api_keys row that either does not exist or does not belong to a
// service-account user.
var ErrServiceAccountNotFound = errors.New("service account not found")

// ServiceAccount is one API key belonging to a service-account user, joined
// with its billing policy for the gateway admin surface.
type ServiceAccount struct {
	UserID       uuid.UUID  `json:"user_id"`
	Username     string     `json:"username"`
	DisplayName  string     `json:"display_name"`
	UserStatus   string     `json:"user_status"`
	APIKeyID     uuid.UUID  `json:"api_key_id"`
	KeyPrefix    string     `json:"key_prefix"`
	APIKeyStatus string     `json:"api_key_status"`
	UserGroup    string     `json:"user_group"`
	BillingGroup string     `json:"billing_group"`
	Unlimited    bool       `json:"unlimited"`
	QuotaLimit   *int64     `json:"quota_limit"`
	LastUsedAt   *time.Time `json:"last_used_at"`
	CreatedAt    time.Time  `json:"created_at"`
	// TotalSpentMicrocredits is the sum of settled usage_events for this API
	// key (cost_microcredits where status = 'settled'), 0 when there is none.
	TotalSpentMicrocredits int64 `json:"total_spent_microcredits"`
}

func scanServiceAccount(row pgx.Row) (ServiceAccount, error) {
	var (
		account    ServiceAccount
		quotaLimit pgtype.Int8
		lastUsedAt pgtype.Timestamptz
	)
	err := row.Scan(
		&account.UserID, &account.Username, &account.DisplayName, &account.UserStatus,
		&account.APIKeyID, &account.KeyPrefix, &account.APIKeyStatus,
		&account.UserGroup, &account.BillingGroup, &account.Unlimited, &quotaLimit,
		&lastUsedAt, &account.CreatedAt, &account.TotalSpentMicrocredits,
	)
	if err != nil {
		return ServiceAccount{}, err
	}
	if quotaLimit.Valid {
		value := quotaLimit.Int64
		account.QuotaLimit = &value
	}
	if lastUsedAt.Valid {
		value := lastUsedAt.Time
		account.LastUsedAt = &value
	}
	return account, nil
}

const serviceAccountSelectColumns = `
	u.id, u.username, u.display_name, u.status,
	k.id, k.key_prefix, k.status,
	COALESCE(p.user_group, 'default'), COALESCE(p.billing_group, 'default'),
	COALESCE(p.unlimited, false), p.quota_limit,
	k.last_used_at, k.created_at,
	COALESCE((SELECT sum(cost_microcredits) FROM usage_events
		WHERE usage_events.api_key_id = k.id AND usage_events.status = 'settled'), 0) AS total_spent`

// ListServiceAccounts returns one row per API key belonging to a
// service-account user, oldest user first.
func (store *Store) ListServiceAccounts(ctx context.Context) ([]ServiceAccount, error) {
	if store == nil || store.pool == nil {
		return nil, ErrUnavailable
	}
	rows, err := store.pool.Query(ctx, `
		SELECT `+serviceAccountSelectColumns+`
		FROM users u
		JOIN api_keys k ON k.user_id = u.id
		LEFT JOIN api_key_billing_policies p ON p.api_key_id = k.id
		WHERE u.is_service_account = true
		ORDER BY u.created_at ASC, k.created_at ASC`)
	if err != nil {
		return nil, ErrUnavailable
	}
	defer rows.Close()

	accounts := make([]ServiceAccount, 0)
	for rows.Next() {
		account, scanErr := scanServiceAccount(rows)
		if scanErr != nil {
			return nil, ErrUnavailable
		}
		accounts = append(accounts, account)
	}
	if rows.Err() != nil {
		return nil, ErrUnavailable
	}
	return accounts, nil
}

// UpdateServiceAccountPolicyInput is validated by the caller (adminapi):
// Unlimited and QuotaLimit must satisfy the same invariant as the
// api_key_billing_policies CHECK constraint before this is called.
type UpdateServiceAccountPolicyInput struct {
	BillingGroup string
	Unlimited    bool
	QuotaLimit   *int64
}

// UpdateServiceAccountPolicy upserts the billing policy for a service
// account's API key. It fails with ErrServiceAccountNotFound if the key does
// not belong to a service-account user.
func (store *Store) UpdateServiceAccountPolicy(ctx context.Context, apiKeyID uuid.UUID, input UpdateServiceAccountPolicyInput) (ServiceAccount, error) {
	if store == nil || store.pool == nil {
		return ServiceAccount{}, ErrUnavailable
	}
	tag, err := store.pool.Exec(ctx, `
		INSERT INTO api_key_billing_policies (api_key_id, billing_group, unlimited, quota_limit)
		SELECT k.id, $2, $3, $4
		FROM api_keys k JOIN users u ON u.id = k.user_id
		WHERE k.id = $1 AND u.is_service_account = true
		ON CONFLICT (api_key_id) DO UPDATE SET
			billing_group = EXCLUDED.billing_group,
			unlimited = EXCLUDED.unlimited,
			quota_limit = EXCLUDED.quota_limit,
			updated_at = now()`,
		apiKeyID, input.BillingGroup, input.Unlimited, input.QuotaLimit)
	if err != nil {
		return ServiceAccount{}, ErrUnavailable
	}
	if tag.RowsAffected() == 0 {
		return ServiceAccount{}, ErrServiceAccountNotFound
	}

	row := store.pool.QueryRow(ctx, `
		SELECT `+serviceAccountSelectColumns+`
		FROM users u
		JOIN api_keys k ON k.user_id = u.id
		LEFT JOIN api_key_billing_policies p ON p.api_key_id = k.id
		WHERE k.id = $1`, apiKeyID)
	account, err := scanServiceAccount(row)
	if err != nil {
		return ServiceAccount{}, ErrUnavailable
	}
	return account, nil
}

// RevokeServiceAccountKey marks a service account's API key revoked. It
// fails with ErrServiceAccountNotFound if the key does not belong to a
// service-account user or was already revoked.
func (store *Store) RevokeServiceAccountKey(ctx context.Context, apiKeyID uuid.UUID) error {
	if store == nil || store.pool == nil {
		return ErrUnavailable
	}
	tag, err := store.pool.Exec(ctx, `
		UPDATE api_keys SET status = 'revoked', revoked_at = now(), updated_at = now()
		WHERE id = $1 AND status != 'revoked'
		  AND user_id IN (SELECT id FROM users WHERE is_service_account = true)`, apiKeyID)
	if err != nil {
		return ErrUnavailable
	}
	if tag.RowsAffected() == 0 {
		return ErrServiceAccountNotFound
	}
	return nil
}
