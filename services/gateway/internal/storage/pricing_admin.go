package storage

// Quick-edit pricing admin surface. Every mutation here clones the current
// active pricing catalog into a fresh draft, applies the caller's edits to
// exactly one rule table (copying the other rule table verbatim), then
// retires the old active row and activates the new draft - all inside one
// transaction. The caller (adminapi) never sees "draft" as a concept: a
// successful call always leaves exactly one catalog active, and a failed
// call leaves the previous active catalog completely untouched, because the
// whole sequence rolls back together.
//
// This intentionally does not touch model_availability. That table is out of
// scope for pricing quick-edit and is left attached to whichever catalog
// row it was inserted against (it is not copied forward), matching the
// existing importer's per-catalog ownership model.

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"
)

// ErrInvalidPricingInput is wrapped by validation failures on caller-supplied
// group or model rules. It is returned before any database statement runs.
var ErrInvalidPricingInput = errors.New("invalid pricing input")

// GroupRuleRecord mirrors one pricing_group_rules row for display.
type GroupRuleRecord struct {
	ID               uuid.UUID       `json:"id"`
	CatalogVersionID uuid.UUID       `json:"catalog_version_id"`
	UserGroup        string          `json:"user_group"`
	BillingGroup     string          `json:"billing_group"`
	GroupRatio       decimal.Decimal `json:"group_ratio"`
}

// GroupRuleInput is a caller-supplied replacement group rule. UserGroup may
// be empty (the ordinary billing-group rule); BillingGroup is required.
type GroupRuleInput struct {
	UserGroup    string          `json:"user_group"`
	BillingGroup string          `json:"billing_group"`
	GroupRatio   decimal.Decimal `json:"group_ratio"`
}

// ModelRuleRecord mirrors one pricing_model_rules row for display.
type ModelRuleRecord struct {
	ID                      uuid.UUID                  `json:"id"`
	CatalogVersionID        uuid.UUID                  `json:"catalog_version_id"`
	ModelKey                string                     `json:"model_key"`
	Mode                    string                     `json:"mode"`
	ModelRatio              *decimal.Decimal           `json:"model_ratio,omitempty"`
	FixedPriceUSD           *decimal.Decimal           `json:"fixed_price_usd,omitempty"`
	CompletionRatio         *decimal.Decimal           `json:"completion_ratio,omitempty"`
	CacheReadRatio          *decimal.Decimal           `json:"cache_read_ratio,omitempty"`
	CacheWriteRatio         *decimal.Decimal           `json:"cache_write_ratio,omitempty"`
	CacheWriteOneHourRatio  *decimal.Decimal           `json:"cache_write_one_hour_ratio,omitempty"`
	ImageRatio              *decimal.Decimal           `json:"image_ratio,omitempty"`
	AudioInputRatio         *decimal.Decimal           `json:"audio_input_ratio,omitempty"`
	AudioCompletionRatio    *decimal.Decimal           `json:"audio_completion_ratio,omitempty"`
	TieredExpression        string                     `json:"tiered_expression,omitempty"`
	TieredExpressionHash    string                     `json:"tiered_expression_hash,omitempty"`
	TieredExpressionVersion string                     `json:"tiered_expression_version,omitempty"`
	ToolPrices              map[string]decimal.Decimal `json:"tool_prices,omitempty"`
	EnabledGroups           []string                   `json:"enabled_groups"`
	ProtocolFamilies        []string                   `json:"protocol_families"`
	RuleHash                string                     `json:"rule_hash"`
}

// ModelRuleInput is a caller-supplied replacement model rule. Field names
// mirror the pricing_model_rules columns.
type ModelRuleInput struct {
	ModelKey                string                     `json:"model_key"`
	Mode                    string                     `json:"mode"`
	ModelRatio              *decimal.Decimal           `json:"model_ratio,omitempty"`
	FixedPriceUSD           *decimal.Decimal           `json:"fixed_price_usd,omitempty"`
	CompletionRatio         *decimal.Decimal           `json:"completion_ratio,omitempty"`
	CacheReadRatio          *decimal.Decimal           `json:"cache_read_ratio,omitempty"`
	CacheWriteRatio         *decimal.Decimal           `json:"cache_write_ratio,omitempty"`
	CacheWriteOneHourRatio  *decimal.Decimal           `json:"cache_write_one_hour_ratio,omitempty"`
	ImageRatio              *decimal.Decimal           `json:"image_ratio,omitempty"`
	AudioInputRatio         *decimal.Decimal           `json:"audio_input_ratio,omitempty"`
	AudioCompletionRatio    *decimal.Decimal           `json:"audio_completion_ratio,omitempty"`
	TieredExpression        string                     `json:"tiered_expression,omitempty"`
	TieredExpressionHash    string                     `json:"tiered_expression_hash,omitempty"`
	TieredExpressionVersion string                     `json:"tiered_expression_version,omitempty"`
	ToolPrices              map[string]decimal.Decimal `json:"tool_prices,omitempty"`
	EnabledGroups           []string                   `json:"enabled_groups,omitempty"`
	ProtocolFamilies        []string                   `json:"protocol_families,omitempty"`
}

// GetCurrentPricing returns the active catalog's group rules and model rules
// for display. It performs no mutation and does not require the row to stay
// locked afterward.
func (store *Store) GetCurrentPricing(ctx context.Context) ([]GroupRuleRecord, []ModelRuleRecord, error) {
	if store == nil || store.pool == nil {
		return nil, nil, ErrUnavailable
	}
	var activeID uuid.UUID
	err := store.pool.QueryRow(ctx, `SELECT id FROM pricing_catalog_versions WHERE state = 'active'`).Scan(&activeID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, ErrNoActiveCatalog
	}
	if err != nil {
		return nil, nil, ErrUnavailable
	}
	groupRules, err := loadGroupRules(ctx, store.pool, activeID)
	if err != nil {
		return nil, nil, err
	}
	modelRules, err := loadModelRules(ctx, store.pool, activeID)
	if err != nil {
		return nil, nil, err
	}
	return groupRules, modelRules, nil
}

// queryRower is satisfied by both *pgxpool.Pool and pgx.Tx so the read
// helpers below can run either outside a transaction (GetCurrentPricing) or
// inside one (the replace-and-reread path used by adminapi).
type queryRower interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

func loadGroupRules(ctx context.Context, db queryRower, catalogID uuid.UUID) ([]GroupRuleRecord, error) {
	rows, err := db.Query(ctx, `
		SELECT id, catalog_version_id, user_group, billing_group, group_ratio::text
		FROM pricing_group_rules WHERE catalog_version_id = $1 ORDER BY user_group, billing_group`, catalogID)
	if err != nil {
		return nil, ErrUnavailable
	}
	defer rows.Close()
	records := make([]GroupRuleRecord, 0)
	for rows.Next() {
		var record GroupRuleRecord
		var ratio string
		if err := rows.Scan(&record.ID, &record.CatalogVersionID, &record.UserGroup, &record.BillingGroup, &ratio); err != nil {
			return nil, ErrUnavailable
		}
		value, err := decimal.NewFromString(ratio)
		if err != nil {
			return nil, ErrUnavailable
		}
		record.GroupRatio = value
		records = append(records, record)
	}
	if rows.Err() != nil {
		return nil, ErrUnavailable
	}
	return records, nil
}

func loadModelRules(ctx context.Context, db queryRower, catalogID uuid.UUID) ([]ModelRuleRecord, error) {
	rows, err := db.Query(ctx, `
		SELECT id, catalog_version_id, model_key, mode,
		       model_ratio::text, fixed_price_usd::text, completion_ratio::text, cache_read_ratio::text,
		       cache_write_ratio::text, cache_write_one_hour_ratio::text, image_ratio::text,
		       audio_input_ratio::text, audio_completion_ratio::text,
		       COALESCE(tiered_expression, ''), COALESCE(tiered_expression_hash, ''), COALESCE(tiered_expression_version, ''),
		       tool_prices, enabled_groups, protocol_families, rule_hash
		FROM pricing_model_rules WHERE catalog_version_id = $1 ORDER BY model_key`, catalogID)
	if err != nil {
		return nil, ErrUnavailable
	}
	defer rows.Close()
	records := make([]ModelRuleRecord, 0)
	for rows.Next() {
		var record ModelRuleRecord
		var numeric [9]*string
		var toolRaw json.RawMessage
		if err := rows.Scan(
			&record.ID, &record.CatalogVersionID, &record.ModelKey, &record.Mode,
			&numeric[0], &numeric[1], &numeric[2], &numeric[3], &numeric[4], &numeric[5], &numeric[6], &numeric[7], &numeric[8],
			&record.TieredExpression, &record.TieredExpressionHash, &record.TieredExpressionVersion,
			&toolRaw, &record.EnabledGroups, &record.ProtocolFamilies, &record.RuleHash,
		); err != nil {
			return nil, ErrUnavailable
		}
		targets := []**decimal.Decimal{
			&record.ModelRatio, &record.FixedPriceUSD, &record.CompletionRatio, &record.CacheReadRatio,
			&record.CacheWriteRatio, &record.CacheWriteOneHourRatio, &record.ImageRatio,
			&record.AudioInputRatio, &record.AudioCompletionRatio,
		}
		for index, raw := range numeric {
			if raw == nil {
				continue
			}
			value, err := decimal.NewFromString(*raw)
			if err != nil {
				return nil, ErrUnavailable
			}
			*targets[index] = &value
		}
		if len(toolRaw) > 0 {
			var prices map[string]decimal.Decimal
			if err := json.Unmarshal(toolRaw, &prices); err == nil && len(prices) > 0 {
				record.ToolPrices = prices
			}
		}
		records = append(records, record)
	}
	if rows.Err() != nil {
		return nil, ErrUnavailable
	}
	return records, nil
}

func validateGroupRuleInputs(rules []GroupRuleInput) error {
	for index, rule := range rules {
		if strings.TrimSpace(rule.BillingGroup) == "" {
			return fmt.Errorf("%w: group_rules[%d].billing_group is required", ErrInvalidPricingInput, index)
		}
		if rule.GroupRatio.IsNegative() {
			return fmt.Errorf("%w: group_rules[%d].group_ratio must be >= 0", ErrInvalidPricingInput, index)
		}
	}
	return nil
}

func validateModelRuleInputs(rules []ModelRuleInput) error {
	for index, rule := range rules {
		if strings.TrimSpace(rule.ModelKey) == "" {
			return fmt.Errorf("%w: model_rules[%d].model_key is required", ErrInvalidPricingInput, index)
		}
		switch rule.Mode {
		case "ratio":
			if rule.ModelRatio == nil {
				return fmt.Errorf("%w: model_rules[%d] mode=ratio requires model_ratio", ErrInvalidPricingInput, index)
			}
		case "fixed":
			if rule.FixedPriceUSD == nil {
				return fmt.Errorf("%w: model_rules[%d] mode=fixed requires fixed_price_usd", ErrInvalidPricingInput, index)
			}
		case "tiered_expr":
			if strings.TrimSpace(rule.TieredExpression) == "" || strings.TrimSpace(rule.TieredExpressionHash) == "" || strings.TrimSpace(rule.TieredExpressionVersion) == "" {
				return fmt.Errorf("%w: model_rules[%d] mode=tiered_expr requires tiered_expression, tiered_expression_hash, and tiered_expression_version", ErrInvalidPricingInput, index)
			}
		default:
			return fmt.Errorf("%w: model_rules[%d].mode must be one of ratio, fixed, tiered_expr", ErrInvalidPricingInput, index)
		}
		numeric := []*decimal.Decimal{
			rule.ModelRatio, rule.FixedPriceUSD, rule.CompletionRatio, rule.CacheReadRatio,
			rule.CacheWriteRatio, rule.CacheWriteOneHourRatio, rule.ImageRatio,
			rule.AudioInputRatio, rule.AudioCompletionRatio,
		}
		for _, value := range numeric {
			if value != nil && value.IsNegative() {
				return fmt.Errorf("%w: model_rules[%d] numeric fields must be >= 0", ErrInvalidPricingInput, index)
			}
		}
		for key, value := range rule.ToolPrices {
			if value.IsNegative() {
				return fmt.Errorf("%w: model_rules[%d].tool_prices[%q] must be >= 0", ErrInvalidPricingInput, index, key)
			}
		}
	}
	return nil
}

// activeCatalogSnapshot is the subset of the active catalog row needed to
// clone it into a new draft.
type activeCatalogSnapshot struct {
	id                uuid.UUID
	algorithmVersion  string
	quotaPerUnit      string
	preConsumedTokens int64
}

// lockActiveCatalog locks the single active catalog row FOR UPDATE inside tx
// so no concurrent quick-edit can race this one to retire/activate.
func lockActiveCatalog(ctx context.Context, tx pgx.Tx) (activeCatalogSnapshot, error) {
	var snapshot activeCatalogSnapshot
	err := tx.QueryRow(ctx, `
		SELECT id, algorithm_version, quota_per_unit::text, pre_consumed_tokens
		FROM pricing_catalog_versions WHERE state = 'active' FOR UPDATE`).
		Scan(&snapshot.id, &snapshot.algorithmVersion, &snapshot.quotaPerUnit, &snapshot.preConsumedTokens)
	if errors.Is(err, pgx.ErrNoRows) {
		return activeCatalogSnapshot{}, ErrNoActiveCatalog
	}
	if err != nil {
		return activeCatalogSnapshot{}, ErrUnavailable
	}
	return snapshot, nil
}

// insertDraftFromActive inserts a new draft catalog row carrying forward the
// active row's algorithm_version/quota_per_unit/pre_consumed_tokens, tagged
// as a manual admin edit with a guaranteed-unique source_hash.
func insertDraftFromActive(ctx context.Context, tx pgx.Tx, active activeCatalogSnapshot) (uuid.UUID, error) {
	var draftID uuid.UUID
	err := tx.QueryRow(ctx, `
		INSERT INTO pricing_catalog_versions (
			state, algorithm_version, quota_per_unit, pre_consumed_tokens,
			source_kind, source_instance_label, source_hash, source_snapshot
		) VALUES ('draft', $1, $2, $3, 'manual_admin_edit', 'gateway-admin', $4, '{}'::jsonb)
		RETURNING id`,
		active.algorithmVersion, active.quotaPerUnit, active.preConsumedTokens, uuid.New().String(),
	).Scan(&draftID)
	if err != nil {
		return uuid.Nil, ErrUnavailable
	}
	return draftID, nil
}

// copyGroupRulesVerbatim copies every pricing_group_rules row from source to
// dest, unchanged.
func copyGroupRulesVerbatim(ctx context.Context, tx pgx.Tx, source, dest uuid.UUID) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO pricing_group_rules (catalog_version_id, user_group, billing_group, group_ratio, source_metadata)
		SELECT $2, user_group, billing_group, group_ratio, source_metadata
		FROM pricing_group_rules WHERE catalog_version_id = $1`, source, dest)
	if err != nil {
		return ErrUnavailable
	}
	return nil
}

// copyModelRulesVerbatim copies every pricing_model_rules row from source to
// dest, unchanged.
func copyModelRulesVerbatim(ctx context.Context, tx pgx.Tx, source, dest uuid.UUID) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO pricing_model_rules (
			catalog_version_id, model_key, mode, model_ratio, fixed_price_usd,
			completion_ratio, cache_read_ratio, cache_write_ratio, cache_write_one_hour_ratio,
			image_ratio, audio_input_ratio, audio_completion_ratio, tiered_expression,
			tiered_expression_hash, tiered_expression_version, tool_prices, enabled_groups,
			protocol_families, rule_hash, source_metadata
		)
		SELECT $2, model_key, mode, model_ratio, fixed_price_usd,
		       completion_ratio, cache_read_ratio, cache_write_ratio, cache_write_one_hour_ratio,
		       image_ratio, audio_input_ratio, audio_completion_ratio, tiered_expression,
		       tiered_expression_hash, tiered_expression_version, tool_prices, enabled_groups,
		       protocol_families, rule_hash, source_metadata
		FROM pricing_model_rules WHERE catalog_version_id = $1`, source, dest)
	if err != nil {
		return ErrUnavailable
	}
	return nil
}

// insertGroupRules inserts the caller-supplied replacement group rules into
// draftID.
func insertGroupRules(ctx context.Context, tx pgx.Tx, draftID uuid.UUID, rules []GroupRuleInput) error {
	for _, rule := range rules {
		_, err := tx.Exec(ctx, `
			INSERT INTO pricing_group_rules (catalog_version_id, user_group, billing_group, group_ratio, source_metadata)
			VALUES ($1, $2, $3, $4, '{"source":"gateway-admin"}'::jsonb)`,
			draftID, rule.UserGroup, rule.BillingGroup, rule.GroupRatio.String())
		if err != nil {
			return ErrUnavailable
		}
	}
	return nil
}

// insertModelRules inserts the caller-supplied replacement model rules into
// draftID.
func insertModelRules(ctx context.Context, tx pgx.Tx, draftID uuid.UUID, rules []ModelRuleInput) error {
	for _, rule := range rules {
		toolPrices, err := json.Marshal(decimalMapStrings(rule.ToolPrices))
		if err != nil {
			return ErrUnavailable
		}
		metadata := []byte(`{"source":"gateway-admin"}`)
		enabledGroups := rule.EnabledGroups
		if enabledGroups == nil {
			enabledGroups = []string{}
		}
		protocolFamilies := rule.ProtocolFamilies
		if protocolFamilies == nil {
			protocolFamilies = []string{}
		}
		var tieredExpression, tieredExpressionHash, tieredExpressionVersion any
		if rule.Mode == "tiered_expr" {
			tieredExpression, tieredExpressionHash, tieredExpressionVersion = rule.TieredExpression, rule.TieredExpressionHash, rule.TieredExpressionVersion
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
			draftID, rule.ModelKey, rule.Mode, decimalPtrString(rule.ModelRatio), decimalPtrString(rule.FixedPriceUSD),
			decimalPtrString(rule.CompletionRatio), decimalPtrString(rule.CacheReadRatio), decimalPtrString(rule.CacheWriteRatio),
			decimalPtrString(rule.CacheWriteOneHourRatio), decimalPtrString(rule.ImageRatio), decimalPtrString(rule.AudioInputRatio),
			decimalPtrString(rule.AudioCompletionRatio), tieredExpression, tieredExpressionHash, tieredExpressionVersion,
			toolPrices, enabledGroups, protocolFamilies, hashModelRuleInput(rule), metadata,
		)
		if err != nil {
			return ErrUnavailable
		}
	}
	return nil
}

func decimalPtrString(value *decimal.Decimal) any {
	if value == nil {
		return nil
	}
	return value.String()
}

func decimalMapStrings(values map[string]decimal.Decimal) map[string]string {
	result := make(map[string]string, len(values))
	for key, value := range values {
		result[key] = value.String()
	}
	return result
}

// hashModelRuleInput derives a deterministic rule_hash from the fields that
// determine a rule's priced behavior. It exists only so the NOT NULL
// rule_hash column is populated with something reproducible for a given
// input; it is not required to match the importer's own hash format.
func hashModelRuleInput(rule ModelRuleInput) string {
	keys := make([]string, 0, len(rule.ToolPrices))
	for key := range rule.ToolPrices {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	var builder strings.Builder
	fmt.Fprintf(&builder, "%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s",
		rule.ModelKey, rule.Mode,
		decimalPtrOrEmpty(rule.ModelRatio), decimalPtrOrEmpty(rule.FixedPriceUSD),
		decimalPtrOrEmpty(rule.CompletionRatio), decimalPtrOrEmpty(rule.CacheReadRatio),
		decimalPtrOrEmpty(rule.CacheWriteRatio), decimalPtrOrEmpty(rule.CacheWriteOneHourRatio),
		decimalPtrOrEmpty(rule.ImageRatio), decimalPtrOrEmpty(rule.AudioInputRatio),
		decimalPtrOrEmpty(rule.AudioCompletionRatio),
		rule.TieredExpression, rule.TieredExpressionHash, rule.TieredExpressionVersion,
		strings.Join(rule.EnabledGroups, ","))
	builder.WriteByte('|')
	builder.WriteString(strings.Join(rule.ProtocolFamilies, ","))
	for _, key := range keys {
		fmt.Fprintf(&builder, "|%s=%s", key, rule.ToolPrices[key].String())
	}
	digest := sha256.Sum256([]byte(builder.String()))
	return hex.EncodeToString(digest[:])
}

func decimalPtrOrEmpty(value *decimal.Decimal) string {
	if value == nil {
		return ""
	}
	return value.String()
}

// ReplaceGroupRules atomically clones the active catalog into a new draft,
// replaces its group rules with the given set (model rules copied verbatim
// from the source), then activates the draft and retires the old active row.
// Returns the new active catalog id. On any failure the transaction rolls
// back and the previously active catalog is left completely untouched.
func (store *Store) ReplaceGroupRules(ctx context.Context, rules []GroupRuleInput) (uuid.UUID, error) {
	if store == nil || store.pool == nil {
		return uuid.Nil, ErrUnavailable
	}
	if err := validateGroupRuleInputs(rules); err != nil {
		return uuid.Nil, err
	}
	tx, err := store.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return uuid.Nil, ErrUnavailable
	}
	defer func() { _ = tx.Rollback(ctx) }()

	active, err := lockActiveCatalog(ctx, tx)
	if err != nil {
		return uuid.Nil, err
	}
	draftID, err := insertDraftFromActive(ctx, tx, active)
	if err != nil {
		return uuid.Nil, err
	}
	if err := copyModelRulesVerbatim(ctx, tx, active.id, draftID); err != nil {
		return uuid.Nil, err
	}
	if err := insertGroupRules(ctx, tx, draftID, rules); err != nil {
		return uuid.Nil, err
	}
	if err := retireAndActivate(ctx, tx, active.id, draftID); err != nil {
		return uuid.Nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, ErrUnavailable
	}
	return draftID, nil
}

// ReplaceModelRules is the model-rules equivalent of ReplaceGroupRules.
func (store *Store) ReplaceModelRules(ctx context.Context, rules []ModelRuleInput) (uuid.UUID, error) {
	if store == nil || store.pool == nil {
		return uuid.Nil, ErrUnavailable
	}
	if err := validateModelRuleInputs(rules); err != nil {
		return uuid.Nil, err
	}
	tx, err := store.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return uuid.Nil, ErrUnavailable
	}
	defer func() { _ = tx.Rollback(ctx) }()

	active, err := lockActiveCatalog(ctx, tx)
	if err != nil {
		return uuid.Nil, err
	}
	draftID, err := insertDraftFromActive(ctx, tx, active)
	if err != nil {
		return uuid.Nil, err
	}
	if err := copyGroupRulesVerbatim(ctx, tx, active.id, draftID); err != nil {
		return uuid.Nil, err
	}
	if err := insertModelRules(ctx, tx, draftID, rules); err != nil {
		return uuid.Nil, err
	}
	if err := retireAndActivate(ctx, tx, active.id, draftID); err != nil {
		return uuid.Nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, ErrUnavailable
	}
	return draftID, nil
}

func retireAndActivate(ctx context.Context, tx pgx.Tx, oldID, newID uuid.UUID) error {
	if _, err := tx.Exec(ctx, `UPDATE pricing_catalog_versions SET state = 'retired' WHERE id = $1`, oldID); err != nil {
		return ErrUnavailable
	}
	if _, err := tx.Exec(ctx, `UPDATE pricing_catalog_versions SET state = 'active', activated_at = now() WHERE id = $1`, newID); err != nil {
		return ErrUnavailable
	}
	return nil
}
