package storage

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"

	"winlume/services/gateway/internal/pricing"
)

var ErrNoActiveCatalog = errors.New("no active pricing catalog")

// LoadActiveCatalog loads an immutable catalog from one repeatable-read view.
// The caller must freeze a Quote before relaying so later activations cannot
// alter a request in flight.
func (store *Store) LoadActiveCatalog(ctx context.Context) (pricing.Catalog, error) {
	if store == nil || store.pool == nil {
		return pricing.Catalog{}, ErrUnavailable
	}
	tx, err := store.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead})
	if err != nil {
		return pricing.Catalog{}, ErrUnavailable
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var (
		id                             uuid.UUID
		algorithmVersion, quotaPerUnit string
		preConsumed                    int64
	)
	err = tx.QueryRow(ctx, `
		SELECT id, algorithm_version, quota_per_unit::text, pre_consumed_tokens
		FROM pricing_catalog_versions WHERE state = 'active'`).
		Scan(&id, &algorithmVersion, &quotaPerUnit, &preConsumed)
	if errors.Is(err, pgx.ErrNoRows) {
		return pricing.Catalog{}, ErrNoActiveCatalog
	}
	if err != nil {
		return pricing.Catalog{}, ErrUnavailable
	}
	quota, err := decimal.NewFromString(quotaPerUnit)
	if err != nil {
		return pricing.Catalog{}, ErrUnavailable
	}
	catalog := pricing.Catalog{ID: id, AlgorithmVersion: algorithmVersion, QuotaPerUnit: quota, PreConsumedTokens: preConsumed}

	rows, err := tx.Query(ctx, `
		SELECT model_key, mode, COALESCE(model_ratio::text, '0'), COALESCE(fixed_price_usd::text, '0'),
		       COALESCE(completion_ratio::text, '0'), COALESCE(cache_read_ratio::text, '0'),
		       COALESCE(cache_write_ratio::text, '0'), COALESCE(cache_write_one_hour_ratio::text, '0'),
		       COALESCE(image_ratio::text, '0'), COALESCE(audio_input_ratio::text, '0'),
		       COALESCE(audio_completion_ratio::text, '0'), COALESCE(tiered_expression, ''),
		       COALESCE(tiered_expression_hash, ''), COALESCE(tiered_expression_version, ''),
		       tool_prices, enabled_groups, protocol_families, rule_hash, source_metadata
		FROM pricing_model_rules WHERE catalog_version_id = $1 ORDER BY model_key`, id)
	if err != nil {
		return pricing.Catalog{}, ErrUnavailable
	}
	defer rows.Close()
	for rows.Next() {
		var rule pricing.Rule
		var mode string
		var numeric [9]string
		var toolRaw, metadata json.RawMessage
		if err := rows.Scan(&rule.ModelKey, &mode, &numeric[0], &numeric[1], &numeric[2], &numeric[3], &numeric[4], &numeric[5], &numeric[6], &numeric[7], &numeric[8], &rule.TieredExpression, &rule.TieredExpressionHash, &rule.TieredExpressionVersion, &toolRaw, &rule.EnabledGroups, &rule.ProtocolFamilies, &rule.RuleHash, &metadata); err != nil {
			return pricing.Catalog{}, ErrUnavailable
		}
		rule.Mode = pricing.Mode(mode)
		values := []*decimal.Decimal{&rule.ModelRatio, &rule.FixedPriceUSD, &rule.CompletionRatio, &rule.CacheReadRatio, &rule.CacheWriteRatio, &rule.CacheWriteOneHourRatio, &rule.ImageRatio, &rule.AudioInputRatio, &rule.AudioCompletionRatio}
		for index, raw := range numeric {
			value, err := decimal.NewFromString(raw)
			if err != nil {
				return pricing.Catalog{}, ErrUnavailable
			}
			*values[index] = value
		}
		if err := json.Unmarshal(toolRaw, &rule.ToolPrices); err != nil {
			return pricing.Catalog{}, ErrUnavailable
		}
		var source struct {
			ProbePolicy pricing.ProbePolicy `json:"probe_policy"`
		}
		if len(metadata) > 0 && json.Unmarshal(metadata, &source) == nil {
			rule.ProbePolicy = source.ProbePolicy
		}
		catalog.Rules = append(catalog.Rules, rule)
	}
	if err := rows.Err(); err != nil {
		return pricing.Catalog{}, ErrUnavailable
	}

	rows, err = tx.Query(ctx, `
		SELECT user_group, billing_group, group_ratio::text
		FROM pricing_group_rules WHERE catalog_version_id = $1 ORDER BY user_group, billing_group`, id)
	if err != nil {
		return pricing.Catalog{}, ErrUnavailable
	}
	defer rows.Close()
	for rows.Next() {
		var group pricing.GroupRule
		var raw string
		if err := rows.Scan(&group.UserGroup, &group.BillingGroup, &raw); err != nil {
			return pricing.Catalog{}, ErrUnavailable
		}
		value, err := decimal.NewFromString(raw)
		if err != nil {
			return pricing.Catalog{}, ErrUnavailable
		}
		group.GroupRatio = value
		catalog.GroupRules = append(catalog.GroupRules, group)
	}
	if err := rows.Err(); err != nil {
		return pricing.Catalog{}, ErrUnavailable
	}
	if err := catalog.Validate(); err != nil {
		return pricing.Catalog{}, fmt.Errorf("%w: invalid active catalog", ErrUnavailable)
	}
	if err := tx.Commit(ctx); err != nil {
		return pricing.Catalog{}, ErrUnavailable
	}
	return catalog, nil
}
