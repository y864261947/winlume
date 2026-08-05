package importer

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"

	"github.com/shopspring/decimal"

	"winlume/services/gateway/internal/pricing"
)

var maxImportedDecimal = decimal.NewFromInt(1_000_000_000_000)

var defaultToolPrices = map[string]decimal.Decimal{
	"web_search":         decimal.NewFromInt(10),
	"web_search_preview": decimal.NewFromInt(10),
	"file_search":        decimal.RequireFromString("2.5"),
	"google_search":      decimal.NewFromInt(14),
}

var defaultToolPriceOverrides = map[string]decimal.Decimal{
	"web_search_preview:gpt-4o*":       decimal.NewFromInt(25),
	"web_search_preview:gpt-4.1*":      decimal.NewFromInt(25),
	"web_search_preview:gpt-4o-mini*":  decimal.NewFromInt(25),
	"web_search_preview:gpt-4.1-mini*": decimal.NewFromInt(25),
}

type catalogSnapshot struct {
	AlgorithmVersion  string                 `json:"algorithm_version"`
	QuotaPerUnit      string                 `json:"quota_per_unit"`
	PreConsumedTokens int64                  `json:"pre_consumed_tokens"`
	Rules             []ruleSnapshot         `json:"rules"`
	GroupRules        []groupRuleSnapshot    `json:"group_rules"`
	Availability      []availabilitySnapshot `json:"availability"`
}

type ruleSnapshot struct {
	ModelKey                string            `json:"model_key"`
	Mode                    string            `json:"mode"`
	ModelRatio              string            `json:"model_ratio,omitempty"`
	FixedPriceUSD           string            `json:"fixed_price_usd,omitempty"`
	CompletionRatio         string            `json:"completion_ratio,omitempty"`
	CacheReadRatio          string            `json:"cache_read_ratio,omitempty"`
	CacheWriteRatio         string            `json:"cache_write_ratio,omitempty"`
	CacheWriteOneHourRatio  string            `json:"cache_write_one_hour_ratio,omitempty"`
	ImageRatio              string            `json:"image_ratio,omitempty"`
	AudioInputRatio         string            `json:"audio_input_ratio,omitempty"`
	AudioCompletionRatio    string            `json:"audio_completion_ratio,omitempty"`
	TieredExpression        string            `json:"tiered_expression,omitempty"`
	TieredExpressionHash    string            `json:"tiered_expression_hash,omitempty"`
	TieredExpressionVersion string            `json:"tiered_expression_version,omitempty"`
	ToolPrices              map[string]string `json:"tool_prices,omitempty"`
	ProbeHeaders            []string          `json:"probe_headers,omitempty"`
	ProbeParams             []string          `json:"probe_params,omitempty"`
}

type groupRuleSnapshot struct {
	UserGroup    string `json:"user_group"`
	BillingGroup string `json:"billing_group"`
	GroupRatio   string `json:"group_ratio"`
}

type availabilitySnapshot struct {
	Model          string `json:"model"`
	BillingGroup   string `json:"billing_group"`
	ProviderType   int64  `json:"provider_type"`
	ProtocolFamily string `json:"protocol_family"`
	Enabled        bool   `json:"enabled"`
	Priority       int64  `json:"priority"`
	Weight         int64  `json:"weight"`
}

// Build validates new-api option values and produces a canonical snapshot.
// Values absent from option rows use the same safe defaults as new-api's
// runtime; unknown models never gain a synthetic price rule.
func Build(source SourceData) (Catalog, error) {
	options := source.Options
	if options == nil {
		options = map[string]string{}
	}

	modelRatios, err := parseDecimalMap(options, "ModelRatio")
	if err != nil {
		return Catalog{}, err
	}
	modelPrices, err := parseDecimalMap(options, "ModelPrice")
	if err != nil {
		return Catalog{}, err
	}
	completionRatios, err := parseDecimalMap(options, "CompletionRatio")
	if err != nil {
		return Catalog{}, err
	}
	cacheRatios, err := parseDecimalMap(options, "CacheRatio")
	if err != nil {
		return Catalog{}, err
	}
	createCacheRatios, err := parseDecimalMap(options, "CreateCacheRatio")
	if err != nil {
		return Catalog{}, err
	}
	imageRatios, err := parseDecimalMap(options, "ImageRatio")
	if err != nil {
		return Catalog{}, err
	}
	audioRatios, err := parseDecimalMap(options, "AudioRatio")
	if err != nil {
		return Catalog{}, err
	}
	audioCompletionRatios, err := parseDecimalMap(options, "AudioCompletionRatio")
	if err != nil {
		return Catalog{}, err
	}
	groupRatios, err := parseDecimalMap(options, "GroupRatio")
	if err != nil {
		return Catalog{}, err
	}
	groupOverrides, err := parseNestedDecimalMap(options, "GroupGroupRatio")
	if err != nil {
		return Catalog{}, err
	}
	billingModes, err := parseStringMap(options, "billing_setting.billing_mode")
	if err != nil {
		return Catalog{}, err
	}
	billingExpressions, err := parseStringMap(options, "billing_setting.billing_expr")
	if err != nil {
		return Catalog{}, err
	}
	configuredToolPrices, err := parseDecimalMap(options, "tool_price_setting.prices")
	if err != nil {
		return Catalog{}, err
	}

	quotaPerUnit, err := parsePositiveDecimalOption(options, "QuotaPerUnit", decimal.NewFromInt(DefaultQuotaPerUnit))
	if err != nil {
		return Catalog{}, err
	}
	preConsumed, err := parseNonNegativeIntOption(options, "PreConsumedQuota", DefaultPreConsumedQuota)
	if err != nil {
		return Catalog{}, err
	}

	ruleKeys := make(map[string]struct{}, len(modelRatios)+len(modelPrices)+len(billingModes))
	for key := range modelRatios {
		ruleKeys[key] = struct{}{}
	}
	for key := range modelPrices {
		ruleKeys[key] = struct{}{}
	}
	for key := range billingModes {
		ruleKeys[key] = struct{}{}
	}
	for key := range billingExpressions {
		ruleKeys[key] = struct{}{}
	}

	keys := sortedKeys(ruleKeys)
	rules := make([]pricing.Rule, 0, len(keys))
	for _, model := range keys {
		if strings.TrimSpace(model) == "" {
			return Catalog{}, fmt.Errorf("%w: pricing rule has an empty model key", ErrInvalidSource)
		}
		rule, err := buildRule(
			model,
			billingModes[model],
			billingExpressions[model],
			modelRatios,
			modelPrices,
			completionRatios,
			cacheRatios,
			createCacheRatios,
			imageRatios,
			audioRatios,
			audioCompletionRatios,
			configuredToolPrices,
		)
		if err != nil {
			return Catalog{}, err
		}
		rules = append(rules, rule)
	}
	if len(rules) == 0 {
		return Catalog{}, fmt.Errorf("%w: source has no priced models", ErrInvalidSource)
	}

	groupRules, err := buildGroupRules(groupRatios, groupOverrides)
	if err != nil {
		return Catalog{}, err
	}
	availability, err := sanitizeAvailability(source.Availability)
	if err != nil {
		return Catalog{}, err
	}

	snapshot := catalogSnapshot{
		AlgorithmVersion:  AlgorithmVersion,
		QuotaPerUnit:      quotaPerUnit.String(),
		PreConsumedTokens: preConsumed,
		Rules:             make([]ruleSnapshot, 0, len(rules)),
		GroupRules:        make([]groupRuleSnapshot, 0, len(groupRules)),
		Availability:      make([]availabilitySnapshot, 0, len(availability)),
	}
	for _, rule := range rules {
		snapshot.Rules = append(snapshot.Rules, snapshotRule(rule))
	}
	for _, rule := range groupRules {
		snapshot.GroupRules = append(snapshot.GroupRules, groupRuleSnapshot{
			UserGroup: rule.UserGroup, BillingGroup: rule.BillingGroup, GroupRatio: rule.GroupRatio.String(),
		})
	}
	for _, item := range availability {
		snapshot.Availability = append(snapshot.Availability, availabilitySnapshot{
			Model: item.Model, BillingGroup: item.BillingGroup, ProviderType: item.ProviderType,
			ProtocolFamily: item.ProtocolFamily, Enabled: item.Enabled, Priority: item.Priority, Weight: item.Weight,
		})
	}
	encoded, err := json.Marshal(snapshot)
	if err != nil {
		return Catalog{}, fmt.Errorf("%w: encode sanitized snapshot", ErrInvalidSource)
	}
	digest := sha256.Sum256(encoded)

	catalog := Catalog{
		SourceHash:        hex.EncodeToString(digest[:]),
		AlgorithmVersion:  AlgorithmVersion,
		QuotaPerUnit:      quotaPerUnit,
		PreConsumedTokens: preConsumed,
		Snapshot:          json.RawMessage(encoded),
		Rules:             rules,
		GroupRules:        groupRules,
		Availability:      availability,
	}
	pricingCatalog := pricing.Catalog{
		AlgorithmVersion:  catalog.AlgorithmVersion,
		QuotaPerUnit:      catalog.QuotaPerUnit,
		PreConsumedTokens: catalog.PreConsumedTokens,
		Rules:             catalog.Rules,
		GroupRules:        catalog.GroupRules,
	}
	if err := pricingCatalog.Validate(); err != nil {
		return Catalog{}, fmt.Errorf("%w: %v", ErrInvalidSource, err)
	}
	return catalog, nil
}

func buildRule(
	model, configuredMode, expression string,
	modelRatios, modelPrices, completionRatios, cacheRatios, createCacheRatios, imageRatios, audioRatios, audioCompletionRatios, configuredToolPrices map[string]decimal.Decimal,
) (pricing.Rule, error) {
	mode := strings.TrimSpace(configuredMode)
	if mode != "" && mode != string(pricing.ModeRatio) && mode != string(pricing.ModeTieredExpr) {
		return pricing.Rule{}, fmt.Errorf("%w: model %q has unsupported billing mode %q", ErrInvalidSource, model, mode)
	}
	rule := pricing.Rule{
		ModelKey:             model,
		CompletionRatio:      valueOr(completionRatios, model, decimal.NewFromInt(1)),
		CacheReadRatio:       valueOr(cacheRatios, model, decimal.NewFromInt(1)),
		CacheWriteRatio:      valueOr(createCacheRatios, model, decimal.RequireFromString("1.25")),
		ImageRatio:           valueOr(imageRatios, model, decimal.NewFromInt(1)),
		AudioInputRatio:      valueOr(audioRatios, model, decimal.NewFromInt(1)),
		AudioCompletionRatio: valueOr(audioCompletionRatios, model, decimal.NewFromInt(1)),
		ToolPrices:           toolPricesForModel(model, configuredToolPrices),
	}
	rule.CacheWriteOneHourRatio = rule.CacheWriteRatio.Mul(decimal.RequireFromString("1.6"))

	if mode == string(pricing.ModeTieredExpr) {
		if strings.TrimSpace(expression) == "" {
			return pricing.Rule{}, fmt.Errorf("%w: tiered model %q has no expression", ErrInvalidSource, model)
		}
		info, err := pricing.ValidateExpression(expression, "")
		if err != nil {
			return pricing.Rule{}, fmt.Errorf("%w: tiered expression for model %q is invalid", ErrInvalidSource, model)
		}
		rule.Mode = pricing.ModeTieredExpr
		rule.TieredExpression = expression
		rule.TieredExpressionHash = info.Hash
		rule.TieredExpressionVersion = info.Version
		rule.ProbePolicy = pricing.ProbePolicy{HeaderNames: info.HeaderKeys, ParamPaths: info.ParamPaths}
	} else if price, ok := modelPrices[model]; ok {
		rule.Mode = pricing.ModeFixed
		rule.FixedPriceUSD = price
	} else if ratio, ok := modelRatios[model]; ok {
		rule.Mode = pricing.ModeRatio
		rule.ModelRatio = ratio
	} else {
		return pricing.Rule{}, fmt.Errorf("%w: model %q has no price, ratio, or tiered expression", ErrInvalidSource, model)
	}

	rule.RuleHash = hashRule(rule)
	return rule, nil
}

func buildGroupRules(groups map[string]decimal.Decimal, overrides map[string]map[string]decimal.Decimal) ([]pricing.GroupRule, error) {
	groupRules := make([]pricing.GroupRule, 0, len(groups)+len(overrides))
	for _, billingGroup := range sortedDecimalKeys(groups) {
		if strings.TrimSpace(billingGroup) == "" {
			return nil, fmt.Errorf("%w: group ratio has an empty billing group", ErrInvalidSource)
		}
		groupRules = append(groupRules, pricing.GroupRule{BillingGroup: billingGroup, GroupRatio: groups[billingGroup]})
	}
	for _, userGroup := range sortedNestedKeys(overrides) {
		if strings.TrimSpace(userGroup) == "" {
			return nil, fmt.Errorf("%w: group override has an empty user group", ErrInvalidSource)
		}
		for _, billingGroup := range sortedDecimalKeys(overrides[userGroup]) {
			if strings.TrimSpace(billingGroup) == "" {
				return nil, fmt.Errorf("%w: group override has an empty billing group", ErrInvalidSource)
			}
			groupRules = append(groupRules, pricing.GroupRule{
				UserGroup: userGroup, BillingGroup: billingGroup, GroupRatio: overrides[userGroup][billingGroup],
			})
		}
	}
	return groupRules, nil
}

func sanitizeAvailability(input []Availability) ([]Availability, error) {
	availability := append([]Availability(nil), input...)
	for index := range availability {
		item := &availability[index]
		item.Model = strings.TrimSpace(item.Model)
		item.BillingGroup = strings.TrimSpace(item.BillingGroup)
		if item.Model == "" || item.BillingGroup == "" {
			return nil, fmt.Errorf("%w: availability has an empty model or group", ErrInvalidSource)
		}
		if item.ProviderType < 0 || item.Priority < 0 || item.Weight < 0 {
			return nil, fmt.Errorf("%w: availability for model %q has a negative selector value", ErrInvalidSource, item.Model)
		}
		item.ProtocolFamily = protocolFamily(item.ProviderType)
		if item.ProtocolFamily == "unknown" {
			item.Enabled = false
		}
	}
	sort.Slice(availability, func(left, right int) bool {
		if availability[left].Model != availability[right].Model {
			return availability[left].Model < availability[right].Model
		}
		if availability[left].BillingGroup != availability[right].BillingGroup {
			return availability[left].BillingGroup < availability[right].BillingGroup
		}
		return availability[left].ProviderType < availability[right].ProviderType
	})

	// The target stores a selector summary rather than one row per upstream
	// channel. Collapse equivalent new-api abilities using its effective choice:
	// highest enabled priority first, then the combined weight at that priority.
	aggregated := make([]Availability, 0, len(availability))
	for index := 0; index < len(availability); {
		current := availability[index]
		end := index + 1
		for end < len(availability) && availability[end].Model == current.Model && availability[end].BillingGroup == current.BillingGroup && availability[end].ProviderType == current.ProviderType {
			end++
		}
		selected := aggregateAvailability(availability[index:end])
		aggregated = append(aggregated, selected)
		index = end
	}
	return aggregated, nil
}

func aggregateAvailability(items []Availability) Availability {
	selected := items[0]
	hasEnabled := false
	selected.Weight = 0
	for _, item := range items {
		if item.Enabled {
			if !hasEnabled || item.Priority > selected.Priority {
				selected = item
				selected.Weight = item.Weight
				hasEnabled = true
			} else if item.Priority == selected.Priority {
				selected.Weight += item.Weight
			}
			continue
		}
		if !hasEnabled && item.Priority > selected.Priority {
			selected = item
		}
	}
	if !hasEnabled {
		selected.Enabled = false
	}
	return selected
}

func protocolFamily(providerType int64) string {
	switch providerType {
	case 14:
		return "claude"
	case 24, 41:
		return "gemini"
	case 2, 5:
		return "midjourney"
	case 36:
		return "suno"
	case 50, 51, 52, 54, 55:
		return "video"
	case 60:
		return "unknown"
	default:
		if providerType > 59 {
			return "unknown"
		}
		return "openai"
	}
}

func parseDecimalMap(options map[string]string, key string) (map[string]decimal.Decimal, error) {
	raw, found := options[key]
	if !found || strings.TrimSpace(raw) == "" {
		return map[string]decimal.Decimal{}, nil
	}
	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.UseNumber()
	var values map[string]json.Number
	if err := decoder.Decode(&values); err != nil || decoder.More() {
		return nil, fmt.Errorf("%w: %s must be a JSON numeric map", ErrInvalidSource, key)
	}
	result := make(map[string]decimal.Decimal, len(values))
	for name, number := range values {
		value, err := parseDecimal(number.String())
		if err != nil {
			return nil, fmt.Errorf("%w: %s contains invalid numeric data for %q", ErrInvalidSource, key, name)
		}
		result[name] = value
	}
	return result, nil
}

func parseNestedDecimalMap(options map[string]string, key string) (map[string]map[string]decimal.Decimal, error) {
	raw, found := options[key]
	if !found || strings.TrimSpace(raw) == "" {
		return map[string]map[string]decimal.Decimal{}, nil
	}
	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.UseNumber()
	var values map[string]map[string]json.Number
	if err := decoder.Decode(&values); err != nil || decoder.More() {
		return nil, fmt.Errorf("%w: %s must be a nested JSON numeric map", ErrInvalidSource, key)
	}
	result := make(map[string]map[string]decimal.Decimal, len(values))
	for outer, children := range values {
		result[outer] = make(map[string]decimal.Decimal, len(children))
		for inner, number := range children {
			value, err := parseDecimal(number.String())
			if err != nil {
				return nil, fmt.Errorf("%w: %s contains invalid numeric data for %q", ErrInvalidSource, key, outer)
			}
			result[outer][inner] = value
		}
	}
	return result, nil
}

func parseStringMap(options map[string]string, key string) (map[string]string, error) {
	raw, found := options[key]
	if !found || strings.TrimSpace(raw) == "" {
		return map[string]string{}, nil
	}
	var values map[string]string
	if err := json.Unmarshal([]byte(raw), &values); err != nil {
		return nil, fmt.Errorf("%w: %s must be a JSON string map", ErrInvalidSource, key)
	}
	return values, nil
}

func parsePositiveDecimalOption(options map[string]string, key string, fallback decimal.Decimal) (decimal.Decimal, error) {
	raw, found := options[key]
	if !found || strings.TrimSpace(raw) == "" {
		return fallback, nil
	}
	value, err := parseDecimal(raw)
	if err != nil || !value.IsPositive() {
		return decimal.Zero, fmt.Errorf("%w: %s must be a positive finite decimal", ErrInvalidSource, key)
	}
	return value, nil
}

func parseNonNegativeIntOption(options map[string]string, key string, fallback int64) (int64, error) {
	raw, found := options[key]
	if !found || strings.TrimSpace(raw) == "" {
		return fallback, nil
	}
	value, err := strconv.ParseInt(strings.TrimSpace(raw), 10, 64)
	if err != nil || value < 0 {
		return 0, fmt.Errorf("%w: %s must be a non-negative integer", ErrInvalidSource, key)
	}
	return value, nil
}

func parseDecimal(raw string) (decimal.Decimal, error) {
	value, err := decimal.NewFromString(strings.TrimSpace(raw))
	if err != nil || value.IsNegative() || value.GreaterThan(maxImportedDecimal) || math.IsNaN(value.InexactFloat64()) || math.IsInf(value.InexactFloat64(), 0) {
		return decimal.Zero, ErrInvalidSource
	}
	return value, nil
}

func valueOr(values map[string]decimal.Decimal, key string, fallback decimal.Decimal) decimal.Decimal {
	if value, found := values[key]; found {
		return value
	}
	return fallback
}

func toolPricesForModel(model string, configured map[string]decimal.Decimal) map[string]decimal.Decimal {
	all := make(map[string]decimal.Decimal, len(defaultToolPrices)+len(defaultToolPriceOverrides)+len(configured))
	for key, value := range defaultToolPrices {
		all[key] = value
	}
	for key, value := range defaultToolPriceOverrides {
		all[key] = value
	}
	for key, value := range configured {
		all[key] = value
	}
	result := make(map[string]decimal.Decimal)
	for key, value := range all {
		tool, prefix, override := strings.Cut(key, ":")
		if !override {
			result[tool] = value
			continue
		}
		prefix = strings.TrimSuffix(prefix, "*")
		if prefix != "" && strings.HasPrefix(model, prefix) {
			result[tool] = value
		}
	}
	return result
}

func snapshotRule(rule pricing.Rule) ruleSnapshot {
	tools := make(map[string]string, len(rule.ToolPrices))
	for key, value := range rule.ToolPrices {
		tools[key] = value.String()
	}
	return ruleSnapshot{
		ModelKey: rule.ModelKey, Mode: string(rule.Mode), ModelRatio: rule.ModelRatio.String(),
		FixedPriceUSD: rule.FixedPriceUSD.String(), CompletionRatio: rule.CompletionRatio.String(),
		CacheReadRatio: rule.CacheReadRatio.String(), CacheWriteRatio: rule.CacheWriteRatio.String(),
		CacheWriteOneHourRatio: rule.CacheWriteOneHourRatio.String(), ImageRatio: rule.ImageRatio.String(),
		AudioInputRatio: rule.AudioInputRatio.String(), AudioCompletionRatio: rule.AudioCompletionRatio.String(),
		TieredExpression: rule.TieredExpression, TieredExpressionHash: rule.TieredExpressionHash,
		TieredExpressionVersion: rule.TieredExpressionVersion, ToolPrices: tools,
		ProbeHeaders: append([]string(nil), rule.ProbePolicy.HeaderNames...),
		ProbeParams:  append([]string(nil), rule.ProbePolicy.ParamPaths...),
	}
}

func hashRule(rule pricing.Rule) string {
	encoded, _ := json.Marshal(snapshotRule(rule))
	digest := sha256.Sum256(encoded)
	return hex.EncodeToString(digest[:])
}

func sortedKeys(values map[string]struct{}) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func sortedDecimalKeys(values map[string]decimal.Decimal) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func sortedNestedKeys(values map[string]map[string]decimal.Decimal) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
