package billing

import "fmt"

// FundingPreference controls the pre-relay order only. Once Reserve selects a
// source it is persisted on the usage event and settlement never re-evaluates
// this policy.
type FundingPreference string

const (
	SubscriptionFirst FundingPreference = "subscription_first"
	WalletFirst       FundingPreference = "wallet_first"
	SubscriptionOnly  FundingPreference = "subscription_only"
	WalletOnly        FundingPreference = "wallet_only"
)

type FundingSource string

const (
	FundingSubscription FundingSource = "subscription"
	FundingWallet       FundingSource = "wallet"
)

func FundingOrder(preference FundingPreference) ([]FundingSource, error) {
	switch preference {
	case SubscriptionFirst:
		return []FundingSource{FundingSubscription, FundingWallet}, nil
	case WalletFirst:
		return []FundingSource{FundingWallet, FundingSubscription}, nil
	case SubscriptionOnly:
		return []FundingSource{FundingSubscription}, nil
	case WalletOnly:
		return []FundingSource{FundingWallet}, nil
	default:
		return nil, fmt.Errorf("unsupported funding preference %q", preference)
	}
}
