package importer

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"

	"reizo/services/gateway/internal/pricing"
)

var importedOptionKeys = []string{
	"ModelRatio", "ModelPrice", "CompletionRatio", "CacheRatio", "CreateCacheRatio",
	"ImageRatio", "AudioRatio", "AudioCompletionRatio", "GroupRatio", "GroupGroupRatio",
	"QuotaPerUnit", "PreConsumedQuota", "billing_setting.billing_mode",
	"billing_setting.billing_expr", "tool_price_setting.prices",
}

// PostgresSource reads the minimum safe subset of the new-api database.
// It never selects any channel credential or endpoint field.
type PostgresSource struct{ pool *pgxpool.Pool }

func NewPostgresSource(ctx context.Context, dsn string) (*PostgresSource, error) {
	pool, err := newPool(ctx, dsn)
	if err != nil {
		return nil, errors.New("new-api pricing source is unavailable")
	}
	return &PostgresSource{pool: pool}, nil
}

func (source *PostgresSource) Close() {
	if source != nil && source.pool != nil {
		source.pool.Close()
	}
}

func (source *PostgresSource) Load(ctx context.Context) (SourceData, error) {
	if source == nil || source.pool == nil {
		return SourceData{}, errors.New("new-api pricing source is unavailable")
	}
	options := make(map[string]string, len(importedOptionKeys))
	rows, err := source.pool.Query(ctx, `SELECT key, value FROM options WHERE key = ANY($1)`, importedOptionKeys)
	if err != nil {
		return SourceData{}, errors.New("new-api pricing options could not be loaded")
	}
	defer rows.Close()
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			return SourceData{}, errors.New("new-api pricing options could not be read")
		}
		options[key] = value
	}
	if err := rows.Err(); err != nil {
		return SourceData{}, errors.New("new-api pricing options could not be read")
	}

	// This join mirrors new-api's capability eligibility without exposing
	// channels.key, base_url, header_override, setting, or other secret fields.
	rows, err = source.pool.Query(ctx, `
		SELECT a."group", a.model, c.type,
		       (a.enabled AND c.status = 1) AS enabled,
		       COALESCE(a.priority, 0), COALESCE(a.weight, 0)
		FROM abilities AS a
		JOIN channels AS c ON c.id = a.channel_id`)
	if err != nil {
		return SourceData{}, errors.New("new-api availability metadata could not be loaded")
	}
	defer rows.Close()
	availability := make([]Availability, 0)
	for rows.Next() {
		var item Availability
		if err := rows.Scan(&item.BillingGroup, &item.Model, &item.ProviderType, &item.Enabled, &item.Priority, &item.Weight); err != nil {
			return SourceData{}, errors.New("new-api availability metadata could not be read")
		}
		availability = append(availability, item)
	}
	if err := rows.Err(); err != nil {
		return SourceData{}, errors.New("new-api availability metadata could not be read")
	}
	return SourceData{Options: options, Availability: availability}, nil
}

// PostgresTarget persists native Reizo catalog rows. It is only constructed
// for an explicit --apply operation.
type PostgresTarget struct{ pool *pgxpool.Pool }

func NewPostgresTarget(ctx context.Context, dsn string) (*PostgresTarget, error) {
	pool, err := newPool(ctx, dsn)
	if err != nil {
		return nil, errors.New("Reizo pricing target is unavailable")
	}
	return &PostgresTarget{pool: pool}, nil
}

func (target *PostgresTarget) Close() {
	if target != nil && target.pool != nil {
		target.pool.Close()
	}
}

func (target *PostgresTarget) FindByHash(ctx context.Context, sourceHash string) (ExistingCatalog, bool, error) {
	var item ExistingCatalog
	err := target.pool.QueryRow(ctx,
		`SELECT id, state FROM pricing_catalog_versions WHERE source_hash = $1`, sourceHash,
	).Scan(&item.ID, &item.State)
	if errors.Is(err, pgx.ErrNoRows) {
		return ExistingCatalog{}, false, nil
	}
	if err != nil {
		return ExistingCatalog{}, false, errors.New("Reizo pricing target could not be queried")
	}
	return item, true, nil
}

func (target *PostgresTarget) InsertDraft(ctx context.Context, catalog Catalog, activate bool) (uuid.UUID, string, error) {
	tx, err := target.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return uuid.Nil, "", errors.New("Reizo pricing target transaction could not start")
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var id uuid.UUID
	err = tx.QueryRow(ctx, `
		INSERT INTO pricing_catalog_versions (
			source_kind, source_instance_label, source_hash, algorithm_version,
			quota_per_unit, pre_consumed_tokens, source_snapshot
		) VALUES ('new-api', $1, $2, $3, $4, $5, $6)
		RETURNING id`,
		catalog.SourceLabel, catalog.SourceHash, catalog.AlgorithmVersion,
		catalog.QuotaPerUnit.String(), catalog.PreConsumedTokens, catalog.Snapshot,
	).Scan(&id)
	if err != nil {
		return uuid.Nil, "", errors.New("Reizo pricing catalog could not be inserted")
	}
	for _, rule := range catalog.Rules {
		if err := insertRule(ctx, tx, id, rule); err != nil {
			return uuid.Nil, "", err
		}
	}
	for _, group := range catalog.GroupRules {
		if _, err := tx.Exec(ctx, `
			INSERT INTO pricing_group_rules (catalog_version_id, user_group, billing_group, group_ratio, source_metadata)
			VALUES ($1, $2, $3, $4, '{"source":"new-api"}'::jsonb)`,
			id, group.UserGroup, group.BillingGroup, group.GroupRatio.String()); err != nil {
			return uuid.Nil, "", errors.New("Reizo pricing group rule could not be inserted")
		}
	}
	for _, item := range catalog.Availability {
		metadata, _ := json.Marshal(map[string]string{"source": "new-api"})
		if _, err := tx.Exec(ctx, `
			INSERT INTO model_availability (
				catalog_version_id, model, billing_group, provider_type, protocol_family,
				enabled, priority, weight, priority_metadata
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			id, item.Model, item.BillingGroup, item.ProviderType, item.ProtocolFamily,
			item.Enabled, item.Priority, item.Weight, metadata); err != nil {
			return uuid.Nil, "", errors.New("Reizo model availability could not be inserted")
		}
	}
	state := "draft"
	if activate {
		if err := activateInTransaction(ctx, tx, id); err != nil {
			return uuid.Nil, "", err
		}
		state = "active"
	}
	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, "", errors.New("Reizo pricing target transaction could not commit")
	}
	return id, state, nil
}

func (target *PostgresTarget) Activate(ctx context.Context, id uuid.UUID) error {
	tx, err := target.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return errors.New("Reizo pricing activation transaction could not start")
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := activateInTransaction(ctx, tx, id); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return errors.New("Reizo pricing activation transaction could not commit")
	}
	return nil
}

func activateInTransaction(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	// Catalog child-row triggers require the catalog to stay draft while rules
	// are inserted. Retire the previous active version before promotion so the
	// partial unique active index remains true throughout this transaction.
	if _, err := tx.Exec(ctx, `UPDATE pricing_catalog_versions SET state = 'retired' WHERE state = 'active'`); err != nil {
		return errors.New("Reizo active pricing catalog could not be retired")
	}
	command, err := tx.Exec(ctx, `
		UPDATE pricing_catalog_versions
		SET state = 'active', activated_at = now()
		WHERE id = $1 AND state = 'draft'`, id)
	if err != nil {
		return errors.New("Reizo pricing catalog could not be activated")
	}
	if command.RowsAffected() != 1 {
		return errors.New("Reizo pricing catalog is not an activatable draft")
	}
	return nil
}

func insertRule(ctx context.Context, tx pgx.Tx, catalogID uuid.UUID, rule pricing.Rule) error {
	toolPrices, err := json.Marshal(decimalStrings(rule.ToolPrices))
	if err != nil {
		return errors.New("Reizo pricing tool prices could not be encoded")
	}
	metadata, err := json.Marshal(map[string]any{
		"source": "new-api",
		"probe_policy": map[string][]string{
			"header_names": rule.ProbePolicy.HeaderNames,
			"param_paths":  rule.ProbePolicy.ParamPaths,
		},
	})
	if err != nil {
		return errors.New("Reizo pricing rule metadata could not be encoded")
	}
	var modelRatio, fixedPrice, expression, expressionHash, expressionVersion any
	switch rule.Mode {
	case pricing.ModeRatio:
		modelRatio = rule.ModelRatio.String()
	case pricing.ModeFixed:
		fixedPrice = rule.FixedPriceUSD.String()
	case pricing.ModeTieredExpr:
		expression, expressionHash, expressionVersion = rule.TieredExpression, rule.TieredExpressionHash, rule.TieredExpressionVersion
	default:
		return errors.New("Reizo pricing rule has an unsupported mode")
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO pricing_model_rules (
			catalog_version_id, model_key, mode, model_ratio, fixed_price_usd,
			completion_ratio, cache_read_ratio, cache_write_ratio, cache_write_one_hour_ratio,
			image_ratio, audio_input_ratio, audio_completion_ratio, tiered_expression,
			tiered_expression_hash, tiered_expression_version, tool_prices, enabled_groups,
			protocol_families, rule_hash, source_metadata
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
		)`,
		catalogID, rule.ModelKey, string(rule.Mode), modelRatio, fixedPrice,
		rule.CompletionRatio.String(), rule.CacheReadRatio.String(), rule.CacheWriteRatio.String(), rule.CacheWriteOneHourRatio.String(),
		rule.ImageRatio.String(), rule.AudioInputRatio.String(), rule.AudioCompletionRatio.String(), expression,
		expressionHash, expressionVersion, toolPrices, rule.EnabledGroups, rule.ProtocolFamilies, rule.RuleHash, metadata,
	)
	if err != nil {
		return errors.New("Reizo pricing rule could not be inserted")
	}
	return nil
}

func decimalStrings(values map[string]decimal.Decimal) map[string]string {
	result := make(map[string]string, len(values))
	for key, value := range values {
		result[key] = value.String()
	}
	return result
}

func newPool(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	if strings.TrimSpace(dsn) == "" {
		return nil, errors.New("missing database URL")
	}
	configuration, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, err
	}
	configuration.MaxConns = 2
	configuration.MinConns = 0
	configuration.MaxConnLifetime = 5 * time.Minute
	configuration.MaxConnIdleTime = time.Minute
	configuration.HealthCheckPeriod = time.Minute
	pool, err := pgxpool.NewWithConfig(ctx, configuration)
	if err != nil {
		return nil, err
	}
	probeCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := pool.Ping(probeCtx); err != nil {
		pool.Close()
		return nil, err
	}
	return pool, nil
}
