package pricing

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"winlume/services/gateway/internal/usage"
)

type parityFixture struct {
	Defaults parityDefaults `json:"defaults"`
	Cases    []parityCase   `json:"cases"`
}

type parityDefaults struct {
	QuotaPerUnit      string `json:"quota_per_unit"`
	PreConsumedTokens int64  `json:"pre_consumed_tokens"`
}

type parityCase struct {
	Name       string          `json:"name"`
	Rule       parityRule      `json:"rule"`
	GroupRatio string          `json:"group_ratio"`
	Estimate   usage.Estimate  `json:"estimate"`
	Usage      usage.Canonical `json:"usage"`
	Expected   parityExpected  `json:"expected"`
}

type parityRule struct {
	Mode                   Mode              `json:"mode"`
	ModelRatio             string            `json:"model_ratio"`
	FixedPriceUSD          string            `json:"fixed_price_usd"`
	CompletionRatio        string            `json:"completion_ratio"`
	CacheReadRatio         string            `json:"cache_read_ratio"`
	CacheWriteRatio        string            `json:"cache_write_ratio"`
	CacheWriteOneHourRatio string            `json:"cache_write_one_hour_ratio"`
	ImageRatio             string            `json:"image_ratio"`
	AudioInputRatio        string            `json:"audio_input_ratio"`
	AudioCompletionRatio   string            `json:"audio_completion_ratio"`
	ToolPrices             map[string]string `json:"tool_prices"`
	ChannelCost            *parityCost       `json:"channel_cost"`
	TieredExpression       string            `json:"tiered_expression"`
}

type parityCost struct {
	InputPriceUSD  string `json:"input_price_usd"`
	OutputPriceUSD string `json:"output_price_usd"`
	FixedPriceUSD  string `json:"fixed_price_usd"`
}

type parityExpected struct {
	Reservation int64     `json:"reservation"`
	Quota       int64     `json:"quota"`
	Delta       int64     `json:"delta"`
	CostQuota   *int64    `json:"cost_quota"`
	ProfitQuota *int64    `json:"profit_quota"`
	Breakdown   Breakdown `json:"breakdown"`
}

func TestNewAPIParity(t *testing.T) {
	fixture := loadParityFixture(t)
	engine := NewEngine()

	for _, vector := range fixture.Cases {
		t.Run(vector.Name, func(t *testing.T) {
			quote := parityQuote(t, fixture.Defaults, vector)

			reservation, err := engine.Reserve(quote)
			require.NoError(t, err)
			require.Equal(t, vector.Expected.Reservation, reservation)

			quote.ReservedQuota = reservation
			settlement, err := engine.Settle(quote, vector.Usage)
			require.NoError(t, err)
			require.Equal(t, vector.Expected.Quota, settlement.Charge.Quota)
			require.Equal(t, vector.Expected.Delta, settlement.Delta)
			require.Equal(t, vector.Expected.CostQuota, settlement.Charge.CostQuota)
			require.Equal(t, vector.Expected.ProfitQuota, settlement.Charge.ProfitQuota)
			require.Equal(t, vector.Expected.Breakdown, settlement.Charge.Breakdown)
		})
	}
}

// TestNewAPITextQuotaFormulaParity locks the production reconciliation case:
// new-api PostTextConsumeQuota computes
//
//	quota = (prompt + completion * completion_ratio) * model_ratio * group_ratio
//
// For gpt-5.5 with prompt=1780, completion=340 (includes reasoning),
// model_ratio=2.5, completion_ratio=6, group_ratio=0.25 the result is 2388.
func TestNewAPITextQuotaFormulaParity(t *testing.T) {
	engine := NewEngine()
	quote := Quote{
		Mode:       ModeRatio,
		Model:      "gpt-5.5",
		GroupRatio: decimal.RequireFromString("0.25"),
		Rule: Rule{
			ModelKey:        "gpt-5.5",
			Mode:            ModeRatio,
			ModelRatio:      decimal.RequireFromString("2.5"),
			CompletionRatio: decimal.RequireFromString("6"),
			CacheReadRatio:  decimal.RequireFromString("0.1"),
		},
		QuotaPerUnit:      decimal.NewFromInt(500000),
		PreConsumedTokens: 500,
		ReservedQuota:     0,
	}
	// Reasoning stays inside TextOutputTokens; it is not an extra line item.
	actual := usage.Canonical{
		TextInputTokens:  1780,
		TextOutputTokens: 340,
		ReasoningTokens:  136,
		Fields:           map[string]usage.Provenance{},
	}
	charge, err := engine.Calculate(quote, actual)
	require.NoError(t, err)
	require.Equal(t, int64(2388), charge.Quota)
}

func TestEngineRejectsUnsafeArithmetic(t *testing.T) {
	engine := NewEngine()
	quote := Quote{
		Mode:              ModeRatio,
		GroupRatio:        decimal.NewFromInt(1),
		Rule:              Rule{ModelKey: "model", Mode: ModeRatio, ModelRatio: decimal.NewFromInt(1)},
		QuotaPerUnit:      decimal.NewFromInt(500000),
		PreConsumedTokens: 500,
	}

	t.Run("negative usage", func(t *testing.T) {
		_, err := engine.Calculate(quote, usage.Canonical{TextInputTokens: -1})
		require.ErrorIs(t, err, ErrInvalidUsage)
	})

	t.Run("negative frozen rule", func(t *testing.T) {
		unsafeQuote := quote
		unsafeQuote.Rule.ModelRatio = decimal.NewFromInt(-1)
		_, err := engine.Reserve(unsafeQuote)
		require.ErrorIs(t, err, ErrInvalidQuote)
	})

	t.Run("quota overflow", func(t *testing.T) {
		unsafeQuote := quote
		unsafeQuote.Rule.ModelRatio = decimal.RequireFromString("100000000000000000000000000000000000000")
		_, err := engine.Calculate(unsafeQuote, usage.Canonical{TextInputTokens: math.MaxInt64})
		require.ErrorIs(t, err, ErrQuotaOverflow)
	})
}

func loadParityFixture(t *testing.T) parityFixture {
	t.Helper()
	payload, err := os.ReadFile(filepath.Join("..", "..", "testdata", "newapi-parity.json"))
	require.NoError(t, err)

	var fixture parityFixture
	require.NoError(t, json.Unmarshal(payload, &fixture))
	require.NotEmpty(t, fixture.Cases)
	return fixture
}

func parityQuote(t *testing.T, defaults parityDefaults, vector parityCase) Quote {
	t.Helper()
	rule := Rule{
		ModelKey:               vector.Name,
		Mode:                   vector.Rule.Mode,
		ModelRatio:             parityDecimal(t, vector.Rule.ModelRatio),
		FixedPriceUSD:          parityDecimal(t, vector.Rule.FixedPriceUSD),
		CompletionRatio:        parityDecimal(t, vector.Rule.CompletionRatio),
		CacheReadRatio:         parityDecimal(t, vector.Rule.CacheReadRatio),
		CacheWriteRatio:        parityDecimal(t, vector.Rule.CacheWriteRatio),
		CacheWriteOneHourRatio: parityDecimal(t, vector.Rule.CacheWriteOneHourRatio),
		ImageRatio:             parityDecimal(t, vector.Rule.ImageRatio),
		AudioInputRatio:        parityDecimal(t, vector.Rule.AudioInputRatio),
		AudioCompletionRatio:   parityDecimal(t, vector.Rule.AudioCompletionRatio),
		TieredExpression:       vector.Rule.TieredExpression,
		ToolPrices:             make(map[string]decimal.Decimal, len(vector.Rule.ToolPrices)),
	}
	for tool, price := range vector.Rule.ToolPrices {
		rule.ToolPrices[tool] = parityDecimal(t, price)
	}
	if vector.Rule.ChannelCost != nil {
		rule.ChannelCost = &ChannelCostRule{
			InputPriceUSD:  parityDecimal(t, vector.Rule.ChannelCost.InputPriceUSD),
			OutputPriceUSD: parityDecimal(t, vector.Rule.ChannelCost.OutputPriceUSD),
			FixedPriceUSD:  parityDecimal(t, vector.Rule.ChannelCost.FixedPriceUSD),
		}
	}

	catalog := Catalog{
		QuotaPerUnit:      parityDecimal(t, defaults.QuotaPerUnit),
		PreConsumedTokens: defaults.PreConsumedTokens,
		Rules:             []Rule{rule},
		GroupRules: []GroupRule{{
			BillingGroup: "default",
			GroupRatio:   parityDecimal(t, vector.GroupRatio),
		}},
	}
	quote, err := catalog.Quote(QuoteRequest{
		Model:        vector.Name,
		BillingGroup: "default",
		Estimate:     vector.Estimate,
		Request: RequestInput{
			EvaluationTime: time.Date(2026, time.August, 5, 0, 0, 0, 0, time.UTC),
		},
	})
	require.NoError(t, err)
	return quote
}

func parityDecimal(t *testing.T, value string) decimal.Decimal {
	t.Helper()
	if value == "" {
		return decimal.Zero
	}
	parsed, err := decimal.NewFromString(value)
	require.NoError(t, err)
	return parsed
}
