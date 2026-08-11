package pricing

import (
	"errors"
	"fmt"
	"math"

	"github.com/shopspring/decimal"

	"reizo/services/gateway/internal/usage"
)

var (
	// ErrInvalidQuote identifies corrupted or unsafe frozen pricing data.
	ErrInvalidQuote = errors.New("pricing: invalid frozen quote")
	// ErrInvalidUsage identifies canonical values that cannot safely settle.
	ErrInvalidUsage = errors.New("pricing: invalid canonical usage")
	// ErrQuotaOverflow prevents a decimal result from wrapping during int64 conversion.
	ErrQuotaOverflow = errors.New("pricing: quota overflows int64")
)

var (
	quotaPerMillionTokens = decimal.NewFromInt(1_000_000)
	maxQuotaDecimal       = decimal.NewFromInt(math.MaxInt64)
	maxExpressionDecimal  = decimal.NewFromInt(1 << 53)
)

// Engine performs deterministic arithmetic over an already frozen Quote. It
// intentionally owns no catalog or configuration, so settlement cannot reload
// an active rule after relay has started.
type Engine struct{}

// NewEngine creates the stateless pricing arithmetic engine.
func NewEngine() Engine {
	return Engine{}
}

// Settlement is the final customer charge compared with the recorded hold.
type Settlement struct {
	Charge Charge
	Delta  int64
}

// Reserve calculates the exact pre-consumption amount for the frozen quote.
func (Engine) Reserve(quote Quote) (int64, error) {
	if err := validateFrozenQuote(quote); err != nil {
		return 0, err
	}

	switch quote.Mode {
	case ModeRatio:
		prompt := decimal.NewFromInt(quote.Estimated.PromptTokens)
		minimum := decimal.NewFromInt(quote.PreConsumedTokens)
		if prompt.LessThan(minimum) {
			prompt = minimum
		}
		reservation := prompt.
			Add(decimal.NewFromInt(quote.Estimated.MaxOutputTokens)).
			Mul(quote.Rule.ModelRatio).
			Mul(quote.GroupRatio)
		return decimalToInt64(reservation, false)
	case ModeFixed:
		reservation := quote.Rule.FixedPriceUSD.
			Mul(quote.QuotaPerUnit).
			Mul(quote.GroupRatio)
		return decimalToInt64(reservation, false)
	case ModeTieredExpr:
		result, err := RunFrozenExpression(quote.Expression, estimateTokenParams(
			quote.Estimated.PromptTokens,
			quote.Estimated.MaxOutputTokens,
		))
		if err != nil {
			return 0, fmt.Errorf("%w: reserve tiered expression: %v", ErrInvalidQuote, err)
		}
		reservation, err := tieredQuotaDecimal(result.Value, quote)
		if err != nil {
			return 0, err
		}
		return decimalToInt64(reservation, true)
	default:
		return 0, fmt.Errorf("%w: unsupported mode %q", ErrInvalidQuote, quote.Mode)
	}
}

// Calculate settles a canonical observation exclusively against its frozen
// quote. The returned breakdown contains rounded quota components for audit;
// the customer quota itself is rounded only once after all components combine.
func (Engine) Calculate(quote Quote, actual usage.Canonical) (Charge, error) {
	if err := validateFrozenQuote(quote); err != nil {
		return Charge{}, err
	}
	if err := validateCanonicalUsage(actual); err != nil {
		return Charge{}, err
	}

	components := make(map[string]decimal.Decimal)
	billable := hasBillableUsage(actual)
	if billable {
		var err error
		switch quote.Mode {
		case ModeRatio:
			components = ratioChargeComponents(quote, actual)
		case ModeFixed:
			components["fixed"] = quote.Rule.FixedPriceUSD.
				Mul(quote.QuotaPerUnit).
				Mul(quote.GroupRatio)
		case ModeTieredExpr:
			components, err = tieredChargeComponents(quote, actual)
			if err != nil {
				return Charge{}, err
			}
		default:
			return Charge{}, fmt.Errorf("%w: unsupported mode %q", ErrInvalidQuote, quote.Mode)
		}

		tools, err := toolChargeComponents(quote, actual)
		if err != nil {
			return Charge{}, err
		}
		for name, value := range tools {
			components[name] = value
		}
	}

	total := sumComponents(components)
	quota, err := decimalToInt64(total, true)
	if err != nil {
		return Charge{}, err
	}
	breakdown := roundedBreakdown(components)
	if quote.Mode == ModeRatio && billable && quote.Rule.ModelRatio.IsPositive() && quota == 0 {
		quota = 1
		breakdown["minimum"] = 1
	}

	charge := Charge{Quota: quota, Breakdown: breakdown}
	if billable && quote.Rule.ChannelCost != nil {
		cost, err := channelCostQuota(quote, actual)
		if err != nil {
			return Charge{}, err
		}
		profit := quota - cost
		charge.CostQuota = &cost
		charge.ProfitQuota = &profit
	}
	return charge, nil
}

// Settle calculates the final charge and its signed difference from the
// reservation stored in the frozen quote.
func (engine Engine) Settle(quote Quote, actual usage.Canonical) (Settlement, error) {
	if quote.ReservedQuota < 0 {
		return Settlement{}, fmt.Errorf("%w: reserved quota must not be negative", ErrInvalidQuote)
	}
	charge, err := engine.Calculate(quote, actual)
	if err != nil {
		return Settlement{}, err
	}
	return Settlement{Charge: charge, Delta: charge.Quota - quote.ReservedQuota}, nil
}

func ratioChargeComponents(quote Quote, actual usage.Canonical) map[string]decimal.Decimal {
	ratio := quote.Rule.ModelRatio.Mul(quote.GroupRatio)
	components := make(map[string]decimal.Decimal)
	addTokenComponent(components, "text_input", actual.TextInputTokens, decimal.NewFromInt(1), ratio)
	addTokenComponent(components, "cache_read", actual.CacheReadTokens, quote.Rule.CacheReadRatio, ratio)

	// Canonical CacheWriteTokens is the normalized aggregate when the provider
	// also reports Claude 5m/1h splits. Charge only its remaining generic part,
	// then charge the explicit splits at their own frozen ratios.
	cacheWrite := cacheWriteRemainder(actual)
	addDecimalComponent(components, "cache_write", cacheWrite, quote.Rule.CacheWriteRatio, ratio)
	addTokenComponent(components, "cache_write_5m", actual.CacheWrite5mTokens, quote.Rule.CacheWriteRatio, ratio)
	addTokenComponent(components, "cache_write_1h", actual.CacheWrite1hTokens, quote.Rule.CacheWriteOneHourRatio, ratio)

	addTokenComponent(components, "image_input", actual.ImageInputTokens, quote.Rule.ImageRatio, ratio)
	addTokenComponent(components, "image_output", actual.ImageOutputTokens, quote.Rule.ImageRatio, ratio)
	addTokenComponent(components, "audio_input", actual.AudioInputTokens, quote.Rule.AudioInputRatio, ratio)
	addTokenComponent(components, "audio_output", actual.AudioOutputTokens, quote.Rule.AudioCompletionRatio, ratio)
	// ReasoningTokens is a TextOutputTokens subcategory, never an extra charge.
	addTokenComponent(components, "text_output", actual.TextOutputTokens, quote.Rule.CompletionRatio, ratio)
	return components
}

func tieredChargeComponents(quote Quote, actual usage.Canonical) (map[string]decimal.Decimal, error) {
	params, err := canonicalTokenParams(quote, actual)
	if err != nil {
		return nil, err
	}
	result, err := RunFrozenExpression(quote.Expression, params)
	if err != nil {
		return nil, fmt.Errorf("%w: settle tiered expression: %v", ErrInvalidQuote, err)
	}
	quota, err := tieredQuotaDecimal(result.Value, quote)
	if err != nil {
		return nil, err
	}
	return map[string]decimal.Decimal{"tiered": quota}, nil
}

func tieredQuotaDecimal(value float64, quote Quote) (decimal.Decimal, error) {
	if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 {
		return decimal.Zero, fmt.Errorf("%w: tiered expression result must be finite and non-negative", ErrInvalidQuote)
	}
	return decimal.NewFromFloat(value).
		Div(quotaPerMillionTokens).
		Mul(quote.QuotaPerUnit).
		Mul(quote.GroupRatio), nil
}

func canonicalTokenParams(quote Quote, actual usage.Canonical) (TokenParams, error) {
	genericWrite := cacheWriteRemainder(actual)
	cacheCreation := genericWrite.Add(decimal.NewFromInt(actual.CacheWrite5mTokens))
	inputLength := decimal.NewFromInt(actual.RawInputTokens)
	if inputLength.IsZero() {
		inputLength = decimal.NewFromInt(actual.TextInputTokens).
			Add(decimal.NewFromInt(actual.CacheReadTokens)).
			Add(decimal.NewFromInt(actual.CacheWriteTokens)).
			Add(decimal.NewFromInt(actual.ImageInputTokens)).
			Add(decimal.NewFromInt(actual.AudioInputTokens))
	}
	if quote.Estimated.Protocol == "claude" || quote.Estimated.Protocol == "anthropic" {
		inputLength = decimal.NewFromInt(actual.TextInputTokens).
			Add(decimal.NewFromInt(actual.CacheReadTokens)).
			Add(decimal.NewFromInt(actual.CacheWriteTokens))
	}

	values := map[string]decimal.Decimal{
		"p":     decimal.NewFromInt(actual.TextInputTokens),
		"c":     decimal.NewFromInt(actual.TextOutputTokens),
		"len":   inputLength,
		"cr":    decimal.NewFromInt(actual.CacheReadTokens),
		"cc":    cacheCreation,
		"cc1h":  decimal.NewFromInt(actual.CacheWrite1hTokens),
		"img":   decimal.NewFromInt(actual.ImageInputTokens),
		"img_o": decimal.NewFromInt(actual.ImageOutputTokens),
		"ai":    decimal.NewFromInt(actual.AudioInputTokens),
		"ao":    decimal.NewFromInt(actual.AudioOutputTokens),
	}
	converted := make(map[string]float64, len(values))
	for name, value := range values {
		if value.GreaterThan(maxExpressionDecimal) {
			return TokenParams{}, fmt.Errorf("%w: tiered token parameter %s exceeds exact expression range", ErrInvalidUsage, name)
		}
		floatValue, _ := value.Float64()
		if math.IsNaN(floatValue) || math.IsInf(floatValue, 0) {
			return TokenParams{}, fmt.Errorf("%w: tiered token parameter %s is not finite", ErrInvalidUsage, name)
		}
		converted[name] = floatValue
	}
	return TokenParams{
		P:    converted["p"],
		C:    converted["c"],
		Len:  converted["len"],
		CR:   converted["cr"],
		CC:   converted["cc"],
		CC1h: converted["cc1h"],
		Img:  converted["img"],
		ImgO: converted["img_o"],
		AI:   converted["ai"],
		AO:   converted["ao"],
	}, nil
}

func channelCostQuota(quote Quote, actual usage.Canonical) (int64, error) {
	cost := quote.Rule.ChannelCost
	inputTokens := decimal.NewFromInt(actual.RawInputTokens)
	if inputTokens.IsZero() {
		inputTokens = decimal.NewFromInt(actual.TextInputTokens)
	}
	amount := inputTokens.Mul(cost.InputPriceUSD).
		Add(decimal.NewFromInt(actual.TextOutputTokens).Mul(cost.OutputPriceUSD)).
		Div(quotaPerMillionTokens).
		Add(cost.FixedPriceUSD).
		Mul(quote.QuotaPerUnit)
	return decimalToInt64(amount, true)
}

func validateFrozenQuote(quote Quote) error {
	if quote.Mode != quote.Rule.Mode {
		return fmt.Errorf("%w: quote mode %q does not match rule mode %q", ErrInvalidQuote, quote.Mode, quote.Rule.Mode)
	}
	if quote.GroupRatio.IsNegative() {
		return fmt.Errorf("%w: group ratio must not be negative", ErrInvalidQuote)
	}
	if quote.QuotaPerUnit.LessThanOrEqual(decimal.Zero) {
		return fmt.Errorf("%w: quota per unit must be positive", ErrInvalidQuote)
	}
	if quote.PreConsumedTokens < 0 || quote.Estimated.PromptTokens < 0 || quote.Estimated.MaxOutputTokens < 0 {
		return fmt.Errorf("%w: estimated and pre-consumed tokens must not be negative", ErrInvalidQuote)
	}
	if err := validateRule(quote.Rule); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidQuote, err)
	}
	if quote.Mode == ModeTieredExpr && quote.Expression == nil {
		return fmt.Errorf("%w: tiered quote requires a frozen expression", ErrInvalidQuote)
	}
	return nil
}

func validateCanonicalUsage(actual usage.Canonical) error {
	for name, value := range map[string]int64{
		"raw_input_tokens":      actual.RawInputTokens,
		"text_input_tokens":     actual.TextInputTokens,
		"text_output_tokens":    actual.TextOutputTokens,
		"reasoning_tokens":      actual.ReasoningTokens,
		"cache_read_tokens":     actual.CacheReadTokens,
		"cache_write_tokens":    actual.CacheWriteTokens,
		"cache_write_5m_tokens": actual.CacheWrite5mTokens,
		"cache_write_1h_tokens": actual.CacheWrite1hTokens,
		"image_input_tokens":    actual.ImageInputTokens,
		"image_output_tokens":   actual.ImageOutputTokens,
		"audio_input_tokens":    actual.AudioInputTokens,
		"audio_output_tokens":   actual.AudioOutputTokens,
		"duration_milliseconds": actual.DurationMilliseconds,
	} {
		if value < 0 {
			return fmt.Errorf("%w: %s must not be negative", ErrInvalidUsage, name)
		}
	}
	if actual.ProviderCostUSD.IsNegative() {
		return fmt.Errorf("%w: provider cost must not be negative", ErrInvalidUsage)
	}
	for tool, calls := range actual.Calls {
		if calls < 0 {
			return fmt.Errorf("%w: calls for %q must not be negative", ErrInvalidUsage, tool)
		}
	}
	return nil
}

func hasBillableUsage(actual usage.Canonical) bool {
	if actual.RawInputTokens != 0 || actual.TextInputTokens != 0 || actual.TextOutputTokens != 0 ||
		actual.ReasoningTokens != 0 || actual.CacheReadTokens != 0 || actual.CacheWriteTokens != 0 ||
		actual.CacheWrite5mTokens != 0 || actual.CacheWrite1hTokens != 0 || actual.ImageInputTokens != 0 ||
		actual.ImageOutputTokens != 0 || actual.AudioInputTokens != 0 || actual.AudioOutputTokens != 0 ||
		actual.DurationMilliseconds != 0 {
		return true
	}
	for _, calls := range actual.Calls {
		if calls != 0 {
			return true
		}
	}
	return false
}

func cacheWriteRemainder(actual usage.Canonical) decimal.Decimal {
	aggregate := decimal.NewFromInt(actual.CacheWriteTokens)
	split := decimal.NewFromInt(actual.CacheWrite5mTokens).Add(decimal.NewFromInt(actual.CacheWrite1hTokens))
	if aggregate.LessThanOrEqual(split) {
		return decimal.Zero
	}
	return aggregate.Sub(split)
}

func addTokenComponent(components map[string]decimal.Decimal, name string, tokens int64, price, ratio decimal.Decimal) {
	addDecimalComponent(components, name, decimal.NewFromInt(tokens), price, ratio)
}

func addDecimalComponent(components map[string]decimal.Decimal, name string, tokens, price, ratio decimal.Decimal) {
	if tokens.IsZero() || price.IsZero() || ratio.IsZero() {
		return
	}
	components[name] = tokens.Mul(price).Mul(ratio)
}

func sumComponents(components map[string]decimal.Decimal) decimal.Decimal {
	total := decimal.Zero
	for _, value := range components {
		total = total.Add(value)
	}
	return total
}

func roundedBreakdown(components map[string]decimal.Decimal) Breakdown {
	breakdown := make(Breakdown, len(components))
	for name, value := range components {
		// Components are individually rounded for audit display; customer quota
		// is rounded once from their exact decimal sum above.
		rounded, err := decimalToInt64(value, true)
		if err == nil {
			breakdown[name] = rounded
		}
	}
	return breakdown
}

func decimalToInt64(value decimal.Decimal, round bool) (int64, error) {
	if value.IsNegative() {
		return 0, fmt.Errorf("%w: negative quota", ErrInvalidQuote)
	}
	if round {
		value = value.Round(0)
	} else {
		value = value.Truncate(0)
	}
	if value.GreaterThan(maxQuotaDecimal) {
		return 0, fmt.Errorf("%w: %s", ErrQuotaOverflow, value.String())
	}
	return value.IntPart(), nil
}
