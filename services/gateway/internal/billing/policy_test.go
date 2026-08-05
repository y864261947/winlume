package billing

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestFundingOrder(t *testing.T) {
	tests := []struct {
		preference FundingPreference
		want       []FundingSource
	}{
		{SubscriptionFirst, []FundingSource{FundingSubscription, FundingWallet}},
		{WalletFirst, []FundingSource{FundingWallet, FundingSubscription}},
		{SubscriptionOnly, []FundingSource{FundingSubscription}},
		{WalletOnly, []FundingSource{FundingWallet}},
	}
	for _, test := range tests {
		t.Run(string(test.preference), func(t *testing.T) {
			got, err := FundingOrder(test.preference)
			require.NoError(t, err)
			require.Equal(t, test.want, got)
		})
	}
}

func TestFundingOrderRejectsUnknownPreference(t *testing.T) {
	_, err := FundingOrder("not-a-policy")
	require.Error(t, err)
}
