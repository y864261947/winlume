package pricing

import (
	"container/list"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestTieredFrozenExpressionDetectsBoundaryCrossing(t *testing.T) {
	snapshot, err := FreezeExpression(
		`v1:p <= 100000 ? tier("base", p * 2 + c * 10) : tier("higher", p * 3 + c * 10)`,
		"",
		TokenParams{P: 100000},
		RequestInput{},
	)
	require.NoError(t, err)
	require.Equal(t, "base", snapshot.EstimatedTier)

	result, err := RunFrozenExpression(snapshot, TokenParams{P: 100001})
	require.NoError(t, err)
	require.Equal(t, "higher", result.MatchedTier)
	require.True(t, result.CrossedTier)
}

func TestTieredExpressionHashVersionAndWhitelist(t *testing.T) {
	expression := `v1:tier("base", p * 2 + c * 10)`
	info, err := ValidateExpression(expression, "")
	require.NoError(t, err)
	require.Equal(t, "4b151f56611b07ea8ee2aba0e690c77870ab2036883a8a44192cccd3962333ff", info.Hash)
	require.Equal(t, "v1", info.Version)
	require.Equal(t, map[string]bool{"p": true, "c": true}, info.UsedVars)

	noPrefix, err := ValidateExpression(`tier("base", p)`, "")
	require.NoError(t, err)
	require.Equal(t, "v1", noPrefix.Version)

	for _, expression := range []string{
		`v2:tier("base", p)`,
		`upper("x")`,
		`now()`,
		`int(p)`,
		`unknown + 1`,
		`len(p)`,
		``,
		`-1`,
		`1.0 / 0.0`,
	} {
		_, err := ValidateExpression(expression, "")
		require.ErrorIs(t, err, ErrInvalidExpression, expression)
	}

	_, err = ValidateExpression(expression, "not-the-expression-hash")
	require.ErrorIs(t, err, ErrExpressionHashMismatch)
}

func TestTieredFrozenExpressionRejectsHashCorruption(t *testing.T) {
	snapshot, err := FreezeExpression(`v1:tier("base", p)`, "", TokenParams{P: 1}, RequestInput{})
	require.NoError(t, err)
	snapshot.Hash = "corrupted"

	_, err = RunFrozenExpression(snapshot, TokenParams{P: 1})
	require.ErrorIs(t, err, ErrExpressionHashMismatch)
}

func TestTieredFrozenExpressionRejectsMissingEvaluationTime(t *testing.T) {
	snapshot, err := FreezeExpression(`v1:tier("base", hour("UTC") * 1.0)`, "", TokenParams{}, RequestInput{})
	require.NoError(t, err)
	snapshot.EvaluationTime = time.Time{}

	_, err = RunFrozenExpression(snapshot, TokenParams{})
	require.ErrorIs(t, err, ErrInvalidExpression)
}

func TestTieredRequestFunctionsFreezeOnlyReferencedValues(t *testing.T) {
	evaluationTime := time.Date(2026, time.August, 5, 1, 2, 3, 0, time.UTC)
	expression := `v1:has(header(" Beta "), "fast-mode") && param("stream_options.fast_mode") == true && param("limit") == 7 && has(param("tags"), "fast") && has(param("options"), "enabled") ? tier("fast", p * 2) : tier("standard", p)`
	snapshot, err := FreezeExpression(
		expression,
		"",
		TokenParams{P: 10},
		RequestInput{
			Headers: map[string]string{
				" beta ":        " fast-mode-2026 ",
				"Authorization": "Bearer not-frozen",
			},
			Body:           []byte(`{"stream_options":{"fast_mode":true},"limit":7,"tags":["fast","safe"],"options":{"enabled":true},"ignored":"not-frozen"}`),
			EvaluationTime: evaluationTime,
		},
	)
	require.NoError(t, err)
	require.Equal(t, "fast", snapshot.EstimatedTier)
	require.Equal(t, map[string]string{"beta": "fast-mode-2026"}, snapshot.HeaderProbes)
	require.Equal(t, map[string]any{
		"stream_options.fast_mode": true,
		"limit":                    float64(7),
		"tags":                     []any{"fast", "safe"},
		"options":                  map[string]any{"enabled": true},
	}, snapshot.ParamProbes)

	result, err := RunFrozenExpression(snapshot, TokenParams{P: 11})
	require.NoError(t, err)
	require.Equal(t, 22.0, result.Value)
	require.False(t, result.CrossedTier)

	missing, err := RunExpression(
		`v1:has(param("missing"), "x") || has("value", "") ? 2 : 1`,
		"",
		TokenParams{},
		RequestInput{Body: []byte(`{"present":true}`)},
	)
	require.NoError(t, err)
	require.Equal(t, 1.0, missing.Value)
}

func TestTieredFreezeUsesLastTierAndFrozenClock(t *testing.T) {
	evaluationTime := time.Date(2026, time.August, 5, 0, 30, 0, 0, time.UTC)
	snapshot, err := FreezeExpression(
		`v1:tier("first", p) + tier("last", hour("Asia/Shanghai") * 100 + minute("not/a-timezone"))`,
		"",
		TokenParams{P: 1},
		RequestInput{EvaluationTime: evaluationTime},
	)
	require.NoError(t, err)
	require.Equal(t, "last", snapshot.EstimatedTier)

	result, err := RunFrozenExpression(snapshot, TokenParams{P: 999})
	require.NoError(t, err)
	require.Equal(t, "last", result.MatchedTier)
	require.False(t, result.CrossedTier)
	// 00:30 UTC is 08:30 in Asia/Shanghai. The invalid timezone is UTC, so
	// minute("not/a-timezone") stays 30 on this frozen instant. The first tier
	// call adds the actual p value, while the last call controls the trace.
	require.Equal(t, 1829.0, result.Value)

	emptyTier, err := FreezeExpression(
		`v1:p > 0 ? tier("nonempty", p) : 0`,
		"",
		TokenParams{},
		RequestInput{EvaluationTime: evaluationTime},
	)
	require.NoError(t, err)
	require.Empty(t, emptyTier.EstimatedTier)
	changed, err := RunFrozenExpression(emptyTier, TokenParams{P: 1})
	require.NoError(t, err)
	require.True(t, changed.CrossedTier)
}

func TestTieredRoundHalfAwayFromZero(t *testing.T) {
	for _, test := range []struct {
		value float64
		want  int64
	}{
		{value: 0.5, want: 1},
		{value: -0.5, want: -1},
		{value: 999.5, want: 1000},
	} {
		require.Equal(t, test.want, RoundHalfAwayFromZero(test.value))
	}
}

func TestTieredCacheUsesVerifiedHashLRUAndDefensiveUsedVars(t *testing.T) {
	resetCompiledExpressionCache(t)
	first := `v1:p + c`
	info, err := ValidateExpression(first, "")
	require.NoError(t, err)
	info.UsedVars["img"] = true
	again, err := ValidateExpression(first, "")
	require.NoError(t, err)
	require.Equal(t, map[string]bool{"p": true, "c": true}, again.UsedVars)

	expressions := make([]string, expressionCacheCapacity+1)
	expressions[0] = first
	for index := 1; index < len(expressions); index++ {
		expressions[index] = fmt.Sprintf(`v1:tier("tier-%d", p + %d)`, index, index)
		_, err := ValidateExpression(expressions[index], "")
		require.NoError(t, err)
	}
	require.Equal(t, expressionCacheCapacity, expressionCacheLength())
	require.False(t, expressionCacheContains(first), "LRU eviction must remove one entry, not clear the cache")
	require.True(t, expressionCacheContains(expressions[1]))
	require.True(t, expressionCacheContains(expressions[len(expressions)-1]))

	_, err = ValidateExpression(expressions[1], "")
	require.NoError(t, err)
	newExpression := `v1:tier("new", p + 9999)`
	_, err = ValidateExpression(newExpression, "")
	require.NoError(t, err)
	require.True(t, expressionCacheContains(expressions[1]), "recently used entry must survive the next eviction")
	require.False(t, expressionCacheContains(expressions[2]), "the oldest remaining entry must be evicted")

	_, err = RunExpression(first, "wrong", TokenParams{P: 1}, RequestInput{})
	require.ErrorIs(t, err, ErrExpressionHashMismatch)
}

func resetCompiledExpressionCache(t *testing.T) {
	t.Helper()
	compiledExpressions.mu.Lock()
	compiledExpressions.entries = make(map[expressionCacheKey]*list.Element)
	compiledExpressions.order.Init()
	compiledExpressions.mu.Unlock()
	t.Cleanup(func() {
		compiledExpressions.mu.Lock()
		compiledExpressions.entries = make(map[expressionCacheKey]*list.Element)
		compiledExpressions.order.Init()
		compiledExpressions.mu.Unlock()
	})
}

func expressionCacheLength() int {
	compiledExpressions.mu.Lock()
	defer compiledExpressions.mu.Unlock()
	return compiledExpressions.order.Len()
}

func expressionCacheContains(expression string) bool {
	key := expressionCacheKey{version: defaultExpressionVersion, hash: ExpressionHash(expression)}
	compiledExpressions.mu.Lock()
	defer compiledExpressions.mu.Unlock()
	_, found := compiledExpressions.entries[key]
	return found
}
