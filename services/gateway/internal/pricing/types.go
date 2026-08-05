// Package pricing contains immutable pricing quotes and deterministic catalog
// matching. Reservation and settlement arithmetic live in the next layer.
package pricing

import (
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"winlume/services/gateway/internal/usage"
)

// Mode identifies the pricing rule selected for a request.
type Mode string

const (
	ModeRatio      Mode = "ratio"
	ModeFixed      Mode = "fixed"
	ModeTieredExpr Mode = "tiered_expr"
)

var (
	// ErrUnpricedModel is matched by an UnpricedModelError returned before relay.
	ErrUnpricedModel = errors.New("pricing: model is not priced")
	// ErrInvalidCatalog identifies a catalog that cannot safely produce a quote.
	ErrInvalidCatalog = errors.New("pricing: invalid catalog")
)

// UnpricedModelError makes an absent model price distinguishable from a relay
// or catalog failure. Gateway runtime intentionally has no self-use fallback.
type UnpricedModelError struct {
	Model string
}

func (err *UnpricedModelError) Error() string {
	return fmt.Sprintf("%v: %q", ErrUnpricedModel, err.Model)
}

func (err *UnpricedModelError) Is(target error) bool {
	return target == ErrUnpricedModel
}

// ChannelCostRule is optional provider-cost data. It is frozen with the
// customer rule but does not affect Task 10 customer pricing.
type ChannelCostRule struct {
	InputPriceUSD  decimal.Decimal
	OutputPriceUSD decimal.Decimal
	FixedPriceUSD  decimal.Decimal
}

// Rule mirrors a pricing_model_rules row without importing the storage layer.
// Decimal zero is a valid configured price or ratio.
type Rule struct {
	ModelKey                string
	Mode                    Mode
	ModelRatio              decimal.Decimal
	FixedPriceUSD           decimal.Decimal
	CompletionRatio         decimal.Decimal
	CacheReadRatio          decimal.Decimal
	CacheWriteRatio         decimal.Decimal
	CacheWriteOneHourRatio  decimal.Decimal
	ImageRatio              decimal.Decimal
	AudioInputRatio         decimal.Decimal
	AudioCompletionRatio    decimal.Decimal
	ToolPrices              map[string]decimal.Decimal
	ChannelCost             *ChannelCostRule
	TieredExpression        string
	TieredExpressionHash    string
	TieredExpressionVersion string
	ProbePolicy             ProbePolicy
	EnabledGroups           []string
	ProtocolFamilies        []string
	RuleHash                string
}

// ProbePolicy is the catalog-declared allowlist for request data that a tiered
// expression may freeze. Empty lists deliberately grant no request access.
type ProbePolicy struct {
	HeaderNames []string
	ParamPaths  []string
}

// GroupRule is a group ratio from the catalog. An empty UserGroup is the
// ordinary billing-group rule. A matching non-empty UserGroup is a special
// user-group-to-billing-group override.
type GroupRule struct {
	UserGroup    string
	BillingGroup string
	GroupRatio   decimal.Decimal
}

// Catalog is the in-memory, versioned price catalog supplied by storage.
// It remains independent from database row types so only frozen values cross
// into a Quote.
type Catalog struct {
	ID                uuid.UUID
	AlgorithmVersion  string
	QuotaPerUnit      decimal.Decimal
	PreConsumedTokens int64
	Rules             []Rule
	GroupRules        []GroupRule
}

// RequestInput provides the only request-derived values available to a
// tiered expression while a quote is being created. The request body is never
// retained in a Quote.
type RequestInput struct {
	Headers        map[string]string
	Body           []byte
	EvaluationTime time.Time
}

// QuoteRequest contains the pre-relay values that must be copied into a quote.
type QuoteRequest struct {
	Model         string
	UserGroup     string
	BillingGroup  string
	Estimate      usage.Estimate
	ReservedQuota int64
	Request       RequestInput
}

// MatchRequest is an alias kept for callers that only need catalog matching.
type MatchRequest = QuoteRequest

// ExpressionSnapshot is the serializable, immutable input to later tiered
// settlement. It contains the exact source bytes and only probes referenced by
// that expression, never raw request headers or a full request body.
type ExpressionSnapshot struct {
	Expression     string
	Hash           string
	Version        string
	UsedVars       map[string]bool
	ProbePolicy    ProbePolicy
	HeaderProbes   map[string]string
	ParamProbes    map[string]any
	EstimatedTier  string
	EvaluationTime time.Time
}

// Quote contains all pricing inputs required by later settlement. Its Rule
// and Expression are deep copies and must not be replaced with active-catalog
// values after relay begins.
type Quote struct {
	CatalogVersionID uuid.UUID
	AlgorithmVersion string
	Model            string
	MatchedModel     string
	Mode             Mode
	GroupRatio       decimal.Decimal
	Rule             Rule
	Estimated        usage.Estimate
	ReservedQuota    int64
	Expression       *ExpressionSnapshot

	UserGroup         string
	BillingGroup      string
	QuotaPerUnit      decimal.Decimal
	PreConsumedTokens int64
}

// Breakdown is reserved for the settlement engine. It is intentionally a
// value map so adding charge dimensions does not alter the frozen Quote shape.
type Breakdown map[string]int64

// Charge is the calculated customer quota and optional provider cost result.
type Charge struct {
	Quota       int64
	CostQuota   *int64
	ProfitQuota *int64
	Breakdown   Breakdown
}

func cloneRule(rule Rule) Rule {
	clone := rule
	clone.ToolPrices = cloneDecimalMap(rule.ToolPrices)
	clone.ProbePolicy = cloneProbePolicy(rule.ProbePolicy)
	clone.EnabledGroups = append([]string(nil), rule.EnabledGroups...)
	clone.ProtocolFamilies = append([]string(nil), rule.ProtocolFamilies...)
	if rule.ChannelCost != nil {
		cost := *rule.ChannelCost
		clone.ChannelCost = &cost
	}
	return clone
}

func cloneProbePolicy(policy ProbePolicy) ProbePolicy {
	return ProbePolicy{
		HeaderNames: append([]string(nil), policy.HeaderNames...),
		ParamPaths:  append([]string(nil), policy.ParamPaths...),
	}
}

func cloneDecimalMap(values map[string]decimal.Decimal) map[string]decimal.Decimal {
	if len(values) == 0 {
		return nil
	}
	clone := make(map[string]decimal.Decimal, len(values))
	for key, value := range values {
		clone[key] = value
	}
	return clone
}

func cloneExpressionSnapshot(snapshot *ExpressionSnapshot) *ExpressionSnapshot {
	if snapshot == nil {
		return nil
	}
	clone := *snapshot
	clone.UsedVars = cloneBoolMap(snapshot.UsedVars)
	clone.ProbePolicy = cloneProbePolicy(snapshot.ProbePolicy)
	clone.HeaderProbes = cloneStringMap(snapshot.HeaderProbes)
	clone.ParamProbes = cloneAnyMap(snapshot.ParamProbes)
	return &clone
}

func cloneBoolMap(values map[string]bool) map[string]bool {
	if len(values) == 0 {
		return nil
	}
	clone := make(map[string]bool, len(values))
	for key, value := range values {
		clone[key] = value
	}
	return clone
}

func cloneStringMap(values map[string]string) map[string]string {
	if len(values) == 0 {
		return nil
	}
	clone := make(map[string]string, len(values))
	for key, value := range values {
		clone[key] = value
	}
	return clone
}

func cloneAnyMap(values map[string]any) map[string]any {
	if len(values) == 0 {
		return nil
	}
	clone := make(map[string]any, len(values))
	for key, value := range values {
		clone[key] = cloneJSONValue(value)
	}
	return clone
}

func cloneJSONValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		clone := make(map[string]any, len(typed))
		for key, item := range typed {
			clone[key] = cloneJSONValue(item)
		}
		return clone
	case []any:
		clone := make([]any, len(typed))
		for index, item := range typed {
			clone[index] = cloneJSONValue(item)
		}
		return clone
	case []byte:
		return append([]byte(nil), typed...)
	default:
		return value
	}
}
