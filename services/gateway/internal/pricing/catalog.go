package pricing

import (
	"fmt"

	"github.com/shopspring/decimal"
)

// Quote resolves one catalog rule and copies every non-runtime price input
// into an immutable value. Tiered expression probe freezing is added by the
// expression implementation in tiered.go.
func (catalog Catalog) Quote(request QuoteRequest) (Quote, error) {
	if err := catalog.validateMetadata(); err != nil {
		return Quote{}, err
	}
	rule, matchedModel, err := catalog.MatchRule(request.Model)
	if err != nil {
		return Quote{}, err
	}
	if err := validateRule(rule); err != nil {
		return Quote{}, err
	}
	groupRatio, err := catalog.resolveGroupRatio(request.UserGroup, request.BillingGroup)
	if err != nil {
		return Quote{}, err
	}

	quote := Quote{
		CatalogVersionID:  catalog.ID,
		AlgorithmVersion:  catalog.AlgorithmVersion,
		Model:             request.Model,
		MatchedModel:      matchedModel,
		Mode:              rule.Mode,
		GroupRatio:        groupRatio,
		Rule:              cloneRule(rule),
		Estimated:         request.Estimate,
		ReservedQuota:     request.ReservedQuota,
		UserGroup:         request.UserGroup,
		BillingGroup:      request.BillingGroup,
		QuotaPerUnit:      catalog.QuotaPerUnit,
		PreConsumedTokens: catalog.PreConsumedTokens,
	}
	if quote.Mode == ModeTieredExpr {
		if err := validateTieredRule(rule); err != nil {
			return Quote{}, err
		}
		expression, err := FreezeExpression(
			rule.TieredExpression,
			rule.TieredExpressionHash,
			estimateTokenParams(request.Estimate.PromptTokens, request.Estimate.MaxOutputTokens),
			request.Request,
		)
		if err != nil {
			return Quote{}, err
		}
		quote.Expression = cloneExpressionSnapshot(expression)
		quote.Rule.TieredExpressionHash = expression.Hash
		quote.Rule.TieredExpressionVersion = expression.Version
	}
	return quote, nil
}

// Validate checks importer-facing catalog data before it can be activated.
// It does not infer prices or introduce a self-use fallback.
func (catalog Catalog) Validate() error {
	if err := catalog.validateMetadata(); err != nil {
		return err
	}
	for _, rule := range catalog.Rules {
		if err := validateRule(rule); err != nil {
			return err
		}
		if rule.Mode == ModeTieredExpr {
			if err := validateTieredRule(rule); err != nil {
				return err
			}
		}
	}
	for _, groupRule := range catalog.GroupRules {
		if groupRule.GroupRatio.IsNegative() {
			return fmt.Errorf("%w: group ratio for %q -> %q must not be negative", ErrInvalidCatalog, groupRule.UserGroup, groupRule.BillingGroup)
		}
	}
	return nil
}

func (catalog Catalog) validateMetadata() error {
	if catalog.QuotaPerUnit.LessThanOrEqual(decimal.Zero) {
		return fmt.Errorf("%w: quota per unit must be positive", ErrInvalidCatalog)
	}
	if catalog.PreConsumedTokens < 0 {
		return fmt.Errorf("%w: pre-consumed tokens must not be negative", ErrInvalidCatalog)
	}
	return nil
}

func (catalog Catalog) resolveGroupRatio(userGroup, billingGroup string) (decimal.Decimal, error) {
	for _, rule := range catalog.GroupRules {
		if rule.GroupRatio.IsNegative() {
			return decimal.Zero, fmt.Errorf("%w: group ratio for %q -> %q must not be negative", ErrInvalidCatalog, rule.UserGroup, rule.BillingGroup)
		}
		if rule.UserGroup != "" && rule.UserGroup == userGroup && rule.BillingGroup == billingGroup {
			return rule.GroupRatio, nil
		}
	}
	for _, rule := range catalog.GroupRules {
		if rule.GroupRatio.IsNegative() {
			return decimal.Zero, fmt.Errorf("%w: group ratio for billing group %q must not be negative", ErrInvalidCatalog, rule.BillingGroup)
		}
		if rule.UserGroup == "" && rule.BillingGroup == billingGroup {
			return rule.GroupRatio, nil
		}
	}
	return decimal.NewFromInt(1), nil
}

func validateRule(rule Rule) error {
	if rule.ModelKey == "" {
		return fmt.Errorf("%w: model key must not be empty", ErrInvalidCatalog)
	}
	switch rule.Mode {
	case ModeRatio, ModeFixed, ModeTieredExpr:
	default:
		return fmt.Errorf("%w: unsupported mode %q for %q", ErrInvalidCatalog, rule.Mode, rule.ModelKey)
	}
	if rule.Mode == ModeTieredExpr && rule.TieredExpression == "" {
		return fmt.Errorf("%w: tiered expression is required for %q", ErrInvalidCatalog, rule.ModelKey)
	}
	for _, value := range []decimal.Decimal{
		rule.ModelRatio,
		rule.FixedPriceUSD,
		rule.CompletionRatio,
		rule.CacheReadRatio,
		rule.CacheWriteRatio,
		rule.CacheWriteOneHourRatio,
		rule.ImageRatio,
		rule.AudioInputRatio,
		rule.AudioCompletionRatio,
	} {
		if value.IsNegative() {
			return fmt.Errorf("%w: negative pricing value for %q", ErrInvalidCatalog, rule.ModelKey)
		}
	}
	for tool, price := range rule.ToolPrices {
		if price.IsNegative() {
			return fmt.Errorf("%w: negative tool price for %q (%s)", ErrInvalidCatalog, rule.ModelKey, tool)
		}
	}
	if rule.ChannelCost != nil {
		for _, value := range []decimal.Decimal{
			rule.ChannelCost.InputPriceUSD,
			rule.ChannelCost.OutputPriceUSD,
			rule.ChannelCost.FixedPriceUSD,
		} {
			if value.IsNegative() {
				return fmt.Errorf("%w: negative channel cost for %q", ErrInvalidCatalog, rule.ModelKey)
			}
		}
	}
	return nil
}

func validateTieredRule(rule Rule) error {
	info, err := ValidateExpression(rule.TieredExpression, rule.TieredExpressionHash)
	if err != nil {
		return fmt.Errorf("%w: tiered expression for %q: %w", ErrInvalidCatalog, rule.ModelKey, err)
	}
	if rule.TieredExpressionVersion != "" && rule.TieredExpressionVersion != info.Version {
		return fmt.Errorf(
			"%w: tiered expression version %q for %q does not match %q",
			ErrInvalidCatalog,
			rule.TieredExpressionVersion,
			rule.ModelKey,
			info.Version,
		)
	}
	return nil
}

func estimateTokenParams(promptTokens, maxOutputTokens int64) TokenParams {
	return TokenParams{
		P:   float64(promptTokens),
		C:   float64(maxOutputTokens),
		Len: float64(promptTokens),
	}
}
