package storage

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"winlume/services/gateway/internal/identity"
)

// LookupAPIKey accepts only identity.HashAPIKey output. Database failures stay
// distinguishable from a missing key so callers fail closed with 503.
func (store *Store) LookupAPIKey(ctx context.Context, digest string) (identity.Identity, error) {
	if store == nil || store.pool == nil {
		return identity.Identity{}, ErrUnavailable
	}
	var (
		result           identity.Identity
		apiKeyID, userID uuid.UUID
		organizationID   pgtype.UUID
		quotaLimit       pgtype.Int8
	)
	err := store.pool.QueryRow(ctx, `
		SELECT k.id, k.user_id, k.organization_id, k.scopes, k.allowed_models, k.allowed_groups, k.ip_allowlist,
		       COALESCE(p.user_group, 'default'), COALESCE(p.billing_group, 'default'),
		       COALESCE(p.unlimited, false), p.quota_limit
		FROM api_keys AS k
		JOIN users AS u ON u.id = k.user_id
		LEFT JOIN api_key_billing_policies AS p ON p.api_key_id = k.id
		WHERE k.key_hash = $1 AND k.status = 'active' AND k.revoked_at IS NULL
		  AND (k.expires_at IS NULL OR k.expires_at > now()) AND u.status = 'active'`, digest).
		Scan(&apiKeyID, &userID, &organizationID, &result.Scopes, &result.AllowedModels, &result.AllowedGroups, &result.IPAllowlist, &result.UserGroup, &result.BillingGroup, &result.Unlimited, &quotaLimit)
	if errors.Is(err, pgx.ErrNoRows) {
		return identity.Identity{}, identity.ErrAPIKeyNotFound
	}
	if err != nil {
		return identity.Identity{}, ErrUnavailable
	}
	result.UserID = userID
	result.APIKeyID = &apiKeyID
	if organizationID.Valid {
		parsed := uuid.UUID(organizationID.Bytes)
		result.OrganizationID = &parsed
	}
	if quotaLimit.Valid {
		limit := quotaLimit.Int64
		result.QuotaLimit = &limit
	}
	return result, nil
}

// MarkAPIKeyUsed is deliberately best-effort and is called only after a key
// was accepted. Its failure never converts authentication into a success.
func (store *Store) MarkAPIKeyUsed(id uuid.UUID) {
	if store == nil || store.pool == nil || id == uuid.Nil {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_, _ = store.pool.Exec(ctx, `UPDATE api_keys SET last_used_at = now() WHERE id = $1`, id)
	}()
}
