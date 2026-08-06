package pricing

import "strings"

const compactModelSuffix = "-openai-compact"

var modePrecedence = []Mode{ModeTieredExpr, ModeFixed, ModeRatio}

// NormalizeModel applies only the model aliases historically supported by
// ratio_setting. It deliberately preserves case and whitespace.
func NormalizeModel(model string) string {
	switch {
	case strings.HasPrefix(model, "gemini-2.5-flash-lite") && strings.Contains(model, "-thinking-"):
		return "gemini-2.5-flash-lite-thinking-*"
	case strings.HasPrefix(model, "gemini-2.5-flash") && strings.Contains(model, "-thinking-"):
		return "gemini-2.5-flash-thinking-*"
	case strings.HasPrefix(model, "gemini-2.5-pro") && strings.Contains(model, "-thinking-"):
		return "gemini-2.5-pro-thinking-*"
	case strings.HasPrefix(model, "gpt-4-gizmo"):
		return "gpt-4-gizmo-*"
	case strings.HasPrefix(model, "gpt-4o-gizmo"):
		return "gpt-4o-gizmo-*"
	default:
		return model
	}
}

// MatchRule chooses one configured rule using normalized model aliases and
// explicit pricing-mode precedence. It never treats catalog keys as generic
// globs.
func (catalog Catalog) MatchRule(model string) (Rule, string, error) {
	normalized := NormalizeModel(model)
	for _, mode := range modePrecedence {
		bestRank := -1
		var selected Rule
		for _, candidate := range catalog.Rules {
			if candidate.Mode != mode {
				continue
			}
			rank, matches := matchModelKey(model, normalized, candidate.ModelKey)
			if !matches || rank <= bestRank {
				continue
			}
			bestRank = rank
			selected = candidate
		}
		if bestRank >= 0 {
			return cloneRule(selected), selected.ModelKey, nil
		}
	}
	return Rule{}, "", &UnpricedModelError{Model: model}
}

// Match is a convenience wrapper for callers using the verb-oriented API.
func (catalog Catalog) Match(request MatchRequest) (Quote, error) {
	return catalog.Quote(QuoteRequest(request))
}

// Match builds a frozen quote from an explicit catalog without consulting any
// active catalog or global pricing configuration.
func Match(catalog Catalog, request MatchRequest) (Quote, error) {
	return catalog.Quote(QuoteRequest(request))
}

func matchModelKey(rawModel, normalizedModel, modelKey string) (int, bool) {
	// Compact models preserve an explicit per-model override before the compact
	// fallback. Pricing-mode precedence remains outside this ranking.
	if strings.HasSuffix(rawModel, compactModelSuffix) && modelKey == rawModel {
		return 3, true
	}
	if modelKey == normalizedModel {
		return 2, true
	}
	if isGeminiFlashLiteAlias(modelKey, normalizedModel) {
		return 1, true
	}
	if strings.HasSuffix(rawModel, compactModelSuffix) && modelKey == "*-openai-compact" {
		return 0, true
	}
	return 0, false
}

func isGeminiFlashLiteAlias(modelKey, normalizedModel string) bool {
	return normalizedModel == "gemini-2.5-flash-lite-thinking-*" &&
		modelKey == "gemini-2.5-flash-lite-preview-thinking-*"
}
