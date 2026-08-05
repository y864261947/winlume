package importer

import (
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"
)

func TestBuildUsesNewAPICompatibilityDefaultsAndAggregatesAvailability(t *testing.T) {
	catalog, err := Build(SourceData{
		Options: map[string]string{
			"ModelRatio":                   `{"chat":1.5}`,
			"ModelPrice":                   `{"image":0.02}`,
			"billing_setting.billing_mode": `{"claude":"tiered_expr"}`,
			"billing_setting.billing_expr": `{"claude":"p * 3 + c * 15"}`,
			"GroupRatio":                   `{"default":1,"vip":0.8}`,
			"GroupGroupRatio":              `{"staff":{"vip":0.5}}`,
		},
		Availability: []Availability{
			{Model: "chat", BillingGroup: "default", ProviderType: 1, Enabled: true, Priority: 1, Weight: 2},
			{Model: "chat", BillingGroup: "default", ProviderType: 1, Enabled: true, Priority: 2, Weight: 3},
			{Model: "chat", BillingGroup: "default", ProviderType: 1, Enabled: true, Priority: 2, Weight: 4},
			{Model: "unknown", BillingGroup: "default", ProviderType: 60, Enabled: true},
		},
	})

	require.NoError(t, err)
	require.Equal(t, decimal.NewFromInt(DefaultQuotaPerUnit), catalog.QuotaPerUnit)
	require.Equal(t, int64(DefaultPreConsumedQuota), catalog.PreConsumedTokens)
	require.Len(t, catalog.Rules, 3)
	require.Len(t, catalog.GroupRules, 3)
	require.Len(t, catalog.Availability, 2)
	require.Len(t, catalog.SourceHash, 64)

	byModel := make(map[string]string)
	for _, rule := range catalog.Rules {
		byModel[rule.ModelKey] = string(rule.Mode)
	}
	require.Equal(t, "ratio", byModel["chat"])
	require.Equal(t, "fixed", byModel["image"])
	require.Equal(t, "tiered_expr", byModel["claude"])

	require.Equal(t, int64(7), catalog.Availability[0].Weight)
	require.True(t, catalog.Availability[0].Enabled)
	require.False(t, catalog.Availability[1].Enabled)
	require.Equal(t, "unknown", catalog.Availability[1].ProtocolFamily)
}
