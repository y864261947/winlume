package pricing

import (
	"fmt"

	"github.com/shopspring/decimal"

	"winlume/services/gateway/internal/usage"
)

var toolPricePerThousandCalls = decimal.NewFromInt(1000)

// toolChargeComponents converts frozen tool prices expressed in USD per one
// thousand calls. Tool prices are independent surcharges: model ratios do not
// multiply them, while the billing group ratio does.
func toolChargeComponents(quote Quote, actual usage.Canonical) (map[string]decimal.Decimal, error) {
	components := make(map[string]decimal.Decimal)
	for tool, calls := range actual.Calls {
		if calls < 0 {
			return nil, fmt.Errorf("%w: calls for %q must not be negative", ErrInvalidUsage, tool)
		}
		price, priced := quote.Rule.ToolPrices[tool]
		if !priced || calls == 0 {
			continue
		}
		components["tool:"+tool] = price.
			Mul(decimal.NewFromInt(calls)).
			Div(toolPricePerThousandCalls).
			Mul(quote.GroupRatio).
			Mul(quote.QuotaPerUnit)
	}
	return components, nil
}
