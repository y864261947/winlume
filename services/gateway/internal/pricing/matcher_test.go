package pricing

import (
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"reizo/services/gateway/internal/usage"
)

func TestMatchExactFixedBeforeRatio(t *testing.T) {
	catalog := Catalog{
		ID:               uuid.New(),
		AlgorithmVersion: "v1",
		QuotaPerUnit:     decimal.NewFromInt(500_000),
		Rules: []Rule{
			{ModelKey: "m", Mode: ModeRatio, ModelRatio: decimal.NewFromInt(9)},
			{ModelKey: "m", Mode: ModeFixed, FixedPriceUSD: decimal.RequireFromString("0.04")},
		},
	}

	quote, err := catalog.Quote(QuoteRequest{
		Model:    "m",
		Estimate: usage.Estimate{Model: "m"},
	})

	require.NoError(t, err)
	require.Equal(t, ModeFixed, quote.Mode)
	require.Equal(t, "m", quote.MatchedModel)
	require.True(t, quote.Rule.FixedPriceUSD.Equal(decimal.RequireFromString("0.04")))
}

func TestCatalogValidateRejectsDuplicateRuleAndGroupOverrideKeys(t *testing.T) {
	ratioOne := Rule{ModelKey: "m", Mode: ModeRatio, ModelRatio: decimal.NewFromInt(1)}
	ratioTwo := Rule{ModelKey: "m", Mode: ModeRatio, ModelRatio: decimal.NewFromInt(2)}
	groupOne := GroupRule{UserGroup: "vip", BillingGroup: "premium", GroupRatio: decimal.NewFromInt(1)}
	groupTwo := GroupRule{UserGroup: "vip", BillingGroup: "premium", GroupRatio: decimal.NewFromInt(2)}

	for _, test := range []struct {
		name       string
		rules      []Rule
		groupRules []GroupRule
	}{
		{
			name:  "duplicate rule in forward order",
			rules: []Rule{ratioOne, ratioTwo},
		},
		{
			name:  "duplicate rule in reverse order",
			rules: []Rule{ratioTwo, ratioOne},
		},
		{
			name:       "duplicate group override in forward order",
			groupRules: []GroupRule{groupOne, groupTwo},
		},
		{
			name:       "duplicate group override in reverse order",
			groupRules: []GroupRule{groupTwo, groupOne},
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			catalog := Catalog{
				QuotaPerUnit: decimal.NewFromInt(1),
				Rules:        test.rules,
				GroupRules:   test.groupRules,
			}

			require.ErrorIs(t, catalog.Validate(), ErrInvalidCatalog)
		})
	}
}

func TestCatalogValidateAllowsSameModelAcrossModes(t *testing.T) {
	catalog := Catalog{
		QuotaPerUnit: decimal.NewFromInt(1),
		Rules: []Rule{
			{ModelKey: "m", Mode: ModeRatio, ModelRatio: decimal.NewFromInt(1)},
			{ModelKey: "m", Mode: ModeFixed, FixedPriceUSD: decimal.RequireFromString("0.04")},
		},
	}

	require.NoError(t, catalog.Validate())
}

func TestMatchTieredPrecedesFixedAndFreezesReferencedRequestProbes(t *testing.T) {
	evaluationTime := time.Date(2026, time.August, 5, 9, 0, 0, 0, time.UTC)
	catalog := Catalog{
		ID:               uuid.New(),
		AlgorithmVersion: "v1",
		QuotaPerUnit:     decimal.NewFromInt(500_000),
		Rules: []Rule{
			{ModelKey: "m", Mode: ModeFixed, FixedPriceUSD: decimal.RequireFromString("0.04")},
			{
				ModelKey:         "m",
				Mode:             ModeTieredExpr,
				TieredExpression: `v1:has(header(" Anthropic-Beta "), "fast-mode") && param("stream_options.fast_mode") == true ? tier("fast", p * 2) : tier("standard", p)`,
				ProbePolicy: ProbePolicy{
					HeaderNames: []string{"Anthropic-Beta"},
					ParamPaths:  []string{"stream_options.fast_mode"},
				},
				ToolPrices: map[string]decimal.Decimal{
					"web_search": decimal.NewFromInt(3),
				},
			},
		},
	}
	request := QuoteRequest{
		Model: "m",
		Estimate: usage.Estimate{
			Model:           "m",
			PromptTokens:    100,
			MaxOutputTokens: 20,
		},
		Request: RequestInput{
			Headers: map[string]string{
				" Anthropic-Beta ": " fast-mode ",
				"Authorization":    "Bearer must-not-be-frozen",
			},
			Body:           []byte(`{"stream_options":{"fast_mode":true},"sensitive":"must-not-be-frozen"}`),
			EvaluationTime: evaluationTime,
		},
	}

	quote, err := catalog.Quote(request)

	require.NoError(t, err)
	require.Equal(t, ModeTieredExpr, quote.Mode)
	require.Equal(t, "fast", quote.Expression.EstimatedTier)
	require.Equal(t, map[string]string{"anthropic-beta": "fast-mode"}, quote.Expression.HeaderProbes)
	require.Equal(t, map[string]any{"stream_options.fast_mode": true}, quote.Expression.ParamProbes)
	require.Equal(t, ProbePolicy{
		HeaderNames: []string{"anthropic-beta"},
		ParamPaths:  []string{"stream_options.fast_mode"},
	}, quote.Expression.ProbePolicy)
	require.Equal(t, quote.Expression.ProbePolicy, quote.Rule.ProbePolicy)
	require.Equal(t, evaluationTime, quote.Expression.EvaluationTime)
	require.NotContains(t, quote.Expression.HeaderProbes, "authorization")
	require.NotContains(t, quote.Expression.ParamProbes, "sensitive")

	catalog.Rules[1].ToolPrices["web_search"] = decimal.NewFromInt(99)
	catalog.Rules[1].ProbePolicy.HeaderNames[0] = "changed"
	request.Request.Headers[" Anthropic-Beta "] = "changed"
	require.True(t, quote.Rule.ToolPrices["web_search"].Equal(decimal.NewFromInt(3)))
	require.Equal(t, "fast-mode", quote.Expression.HeaderProbes["anthropic-beta"])
	require.Equal(t, []string{"anthropic-beta"}, quote.Expression.ProbePolicy.HeaderNames)
	require.Equal(t, []string{"anthropic-beta"}, quote.Rule.ProbePolicy.HeaderNames)
}

func TestMatchTieredProbePolicyRejectsBeforeQuoteFreezesRequestData(t *testing.T) {
	secretValue := "must-not-appear-in-a-quote"
	for _, test := range []struct {
		name       string
		expression string
		policy     ProbePolicy
		request    RequestInput
	}{
		{
			name:       "unapproved header",
			expression: `v1:has(header("Anthropic-Beta"), "fast") ? p * 2 : p`,
			request:    RequestInput{Headers: map[string]string{"Anthropic-Beta": secretValue}},
		},
		{
			name:       "sensitive parameter",
			expression: `v1:param("api_key") == "key" ? p * 2 : p`,
			policy:     ProbePolicy{ParamPaths: []string{"api_key"}},
			request:    RequestInput{Body: []byte(`{"api_key":"must-not-appear-in-a-quote"}`)},
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			catalog := Catalog{
				QuotaPerUnit: decimal.NewFromInt(500_000),
				Rules: []Rule{{
					ModelKey:         "m",
					Mode:             ModeTieredExpr,
					TieredExpression: test.expression,
					ProbePolicy:      test.policy,
				}},
			}

			quote, err := catalog.Quote(QuoteRequest{Model: "m", Request: test.request})
			require.ErrorIs(t, err, ErrInvalidCatalog)
			require.Equal(t, Quote{}, quote)
		})
	}
}

func TestMatchSpecialModelAliasesAndCompactPrecedence(t *testing.T) {
	catalog := Catalog{
		ID:               uuid.New(),
		AlgorithmVersion: "v1",
		QuotaPerUnit:     decimal.NewFromInt(500_000),
		Rules: []Rule{
			{ModelKey: "gpt-4-gizmo-*", Mode: ModeRatio, ModelRatio: decimal.NewFromInt(15)},
			{ModelKey: "gpt-4-gizmo-*", Mode: ModeFixed, FixedPriceUSD: decimal.RequireFromString("0.1")},
			{ModelKey: "gpt-4o-gizmo-*", Mode: ModeRatio, ModelRatio: decimal.RequireFromString("2.5")},
			{ModelKey: "gemini-2.5-flash-thinking-*", Mode: ModeRatio, ModelRatio: decimal.RequireFromString("0.075")},
			{ModelKey: "gemini-2.5-pro-thinking-*", Mode: ModeRatio, ModelRatio: decimal.RequireFromString("0.625")},
			{ModelKey: "gemini-2.5-flash-lite-preview-thinking-*", Mode: ModeRatio, ModelRatio: decimal.RequireFromString("0.05")},
			{ModelKey: "example-openai-compact", Mode: ModeRatio, ModelRatio: decimal.NewFromInt(9)},
			{ModelKey: "*-openai-compact", Mode: ModeFixed, FixedPriceUSD: decimal.RequireFromString("0.04")},
			{ModelKey: "example-zero-openai-compact", Mode: ModeFixed, FixedPriceUSD: decimal.Zero},
			{ModelKey: "example-*", Mode: ModeRatio, ModelRatio: decimal.NewFromInt(7)},
		},
	}

	tests := []struct {
		name         string
		model        string
		mode         Mode
		matchedModel string
		price        decimal.Decimal
	}{
		{
			name:         "gpt4 gizmo fixed wins over ratio",
			model:        "gpt-4-gizmo-123",
			mode:         ModeFixed,
			matchedModel: "gpt-4-gizmo-*",
			price:        decimal.RequireFromString("0.1"),
		},
		{
			name:         "gpt4o gizmo ratio wildcard",
			model:        "gpt-4o-gizmo-123",
			mode:         ModeRatio,
			matchedModel: "gpt-4o-gizmo-*",
			price:        decimal.RequireFromString("2.5"),
		},
		{
			name:         "gemini flash thinking",
			model:        "gemini-2.5-flash-preview-06-01-thinking-123",
			mode:         ModeRatio,
			matchedModel: "gemini-2.5-flash-thinking-*",
			price:        decimal.RequireFromString("0.075"),
		},
		{
			name:         "gemini pro thinking",
			model:        "gemini-2.5-pro-preview-thinking-123",
			mode:         ModeRatio,
			matchedModel: "gemini-2.5-pro-thinking-*",
			price:        decimal.RequireFromString("0.625"),
		},
		{
			name:         "gemini flash lite preview catalog alias",
			model:        "gemini-2.5-flash-lite-preview-06-01-thinking-123",
			mode:         ModeRatio,
			matchedModel: "gemini-2.5-flash-lite-preview-thinking-*",
			price:        decimal.RequireFromString("0.05"),
		},
		{
			name:         "fixed compact wildcard beats ratio exact",
			model:        "example-openai-compact",
			mode:         ModeFixed,
			matchedModel: "*-openai-compact",
			price:        decimal.RequireFromString("0.04"),
		},
		{
			name:         "compact exact fixed zero beats fixed wildcard",
			model:        "example-zero-openai-compact",
			mode:         ModeFixed,
			matchedModel: "example-zero-openai-compact",
			price:        decimal.Zero,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			quote, err := catalog.Quote(QuoteRequest{Model: test.model})
			require.NoError(t, err)
			require.Equal(t, test.mode, quote.Mode)
			require.Equal(t, test.matchedModel, quote.MatchedModel)
			if test.mode == ModeFixed {
				require.True(t, quote.Rule.FixedPriceUSD.Equal(test.price))
			} else {
				require.True(t, quote.Rule.ModelRatio.Equal(test.price))
			}
		})
	}

	_, err := catalog.Quote(QuoteRequest{Model: "example-unknown"})
	require.ErrorIs(t, err, ErrUnpricedModel)
	_, err = catalog.Quote(QuoteRequest{Model: "GPT-4-gizmo-123"})
	require.ErrorIs(t, err, ErrUnpricedModel)
}

func TestMatchUnpricedReturnsTypedErrorWithoutGenericGlob(t *testing.T) {
	catalog := Catalog{
		QuotaPerUnit: decimal.NewFromInt(500_000),
		Rules:        []Rule{{ModelKey: "anything-*", Mode: ModeRatio, ModelRatio: decimal.NewFromInt(1)}},
	}
	_, err := catalog.Quote(QuoteRequest{Model: "anything-else"})

	require.ErrorIs(t, err, ErrUnpricedModel)
	var unpriced *UnpricedModelError
	require.True(t, errors.As(err, &unpriced))
	require.Equal(t, "anything-else", unpriced.Model)
}

func TestMatchResolvesSpecialGroupRatioBeforeOrdinaryGroup(t *testing.T) {
	catalog := Catalog{
		QuotaPerUnit: decimal.NewFromInt(500_000),
		Rules:        []Rule{{ModelKey: "m", Mode: ModeRatio, ModelRatio: decimal.NewFromInt(1)}},
		GroupRules: []GroupRule{
			{UserGroup: "", BillingGroup: "premium", GroupRatio: decimal.RequireFromString("1.2")},
			{UserGroup: "vip", BillingGroup: "premium", GroupRatio: decimal.RequireFromString("0.8")},
		},
	}

	special, err := catalog.Quote(QuoteRequest{Model: "m", UserGroup: "vip", BillingGroup: "premium"})
	require.NoError(t, err)
	require.True(t, special.GroupRatio.Equal(decimal.RequireFromString("0.8")))

	ordinary, err := catalog.Quote(QuoteRequest{Model: "m", UserGroup: "member", BillingGroup: "premium"})
	require.NoError(t, err)
	require.True(t, ordinary.GroupRatio.Equal(decimal.RequireFromString("1.2")))

	missing, err := catalog.Quote(QuoteRequest{Model: "m", UserGroup: "member", BillingGroup: "missing"})
	require.NoError(t, err)
	require.True(t, missing.GroupRatio.Equal(decimal.NewFromInt(1)))

	negative := Catalog{
		Rules:      catalog.Rules,
		GroupRules: []GroupRule{{BillingGroup: "premium", GroupRatio: decimal.NewFromInt(-1)}},
	}
	_, err = negative.Quote(QuoteRequest{Model: "m", BillingGroup: "premium"})
	require.ErrorIs(t, err, ErrInvalidCatalog)
}

func TestMatchRejectsInvalidFrozenCatalogInputs(t *testing.T) {
	ratioRule := Rule{ModelKey: "m", Mode: ModeRatio, ModelRatio: decimal.NewFromInt(1)}
	invalidQuota := Catalog{
		QuotaPerUnit: decimal.Zero,
		Rules:        []Rule{ratioRule},
	}
	_, err := invalidQuota.Quote(QuoteRequest{Model: "m"})
	require.ErrorIs(t, err, ErrInvalidCatalog)

	invalidPreconsumed := Catalog{
		QuotaPerUnit:      decimal.NewFromInt(500_000),
		PreConsumedTokens: -1,
		Rules:             []Rule{ratioRule},
	}
	_, err = invalidPreconsumed.Quote(QuoteRequest{Model: "m"})
	require.ErrorIs(t, err, ErrInvalidCatalog)

	versionMismatch := Catalog{
		QuotaPerUnit: decimal.NewFromInt(500_000),
		Rules: []Rule{{
			ModelKey:                "m",
			Mode:                    ModeTieredExpr,
			TieredExpression:        `v1:tier("base", p)`,
			TieredExpressionVersion: "v2",
		}},
	}
	_, err = versionMismatch.Quote(QuoteRequest{Model: "m"})
	require.ErrorIs(t, err, ErrInvalidCatalog)
}

func TestMatchDeepCopiesAllMutableRuleInputs(t *testing.T) {
	catalog := Catalog{
		ID:                uuid.New(),
		AlgorithmVersion:  "pricing-v1",
		QuotaPerUnit:      decimal.NewFromInt(500_000),
		PreConsumedTokens: 500,
		Rules: []Rule{{
			ModelKey:               "m",
			Mode:                   ModeFixed,
			FixedPriceUSD:          decimal.RequireFromString("0.04"),
			CompletionRatio:        decimal.NewFromInt(2),
			CacheWriteRatio:        decimal.RequireFromString("1.25"),
			CacheWriteOneHourRatio: decimal.NewFromInt(2),
			ImageRatio:             decimal.NewFromInt(3),
			AudioInputRatio:        decimal.NewFromInt(4),
			AudioCompletionRatio:   decimal.NewFromInt(5),
			ToolPrices:             map[string]decimal.Decimal{"web_search": decimal.NewFromInt(6)},
			ChannelCost:            &ChannelCostRule{InputPriceUSD: decimal.RequireFromString("0.001"), OutputPriceUSD: decimal.RequireFromString("0.002")},
			EnabledGroups:          []string{"premium"},
			ProtocolFamilies:       []string{"openai"},
			RuleHash:               "rule-hash",
		}},
	}

	quote, err := catalog.Quote(QuoteRequest{Model: "m"})
	require.NoError(t, err)

	catalog.Rules[0].ToolPrices["web_search"] = decimal.NewFromInt(99)
	catalog.Rules[0].ChannelCost.InputPriceUSD = decimal.NewFromInt(99)
	catalog.Rules[0].EnabledGroups[0] = "changed"
	catalog.Rules[0].ProtocolFamilies[0] = "changed"

	require.True(t, quote.Rule.ToolPrices["web_search"].Equal(decimal.NewFromInt(6)))
	require.True(t, quote.Rule.ChannelCost.InputPriceUSD.Equal(decimal.RequireFromString("0.001")))
	require.Equal(t, []string{"premium"}, quote.Rule.EnabledGroups)
	require.Equal(t, []string{"openai"}, quote.Rule.ProtocolFamilies)
	require.Equal(t, "rule-hash", quote.Rule.RuleHash)
	require.Equal(t, int64(500), quote.PreConsumedTokens)
	require.True(t, quote.QuotaPerUnit.Equal(decimal.NewFromInt(500_000)))
}
