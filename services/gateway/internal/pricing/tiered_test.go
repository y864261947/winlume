package pricing

import (
	"container/list"
	"fmt"
	"math"
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

func TestTieredExpressionValidationRejectsConditionalNumericHazards(t *testing.T) {
	tests := []struct {
		name       string
		expression string
		wantError  string
	}{
		{
			name:       "hidden division by zero",
			expression: `v1:p == 1 ? 1 / (p - 1) : 0`,
			wantError:  "division denominator",
		},
		{
			name:       "hidden negative result",
			expression: `v1:p == 1 ? -1 : 0`,
			wantError:  "can be negative",
		},
		{
			name:       "alternate hidden division by zero",
			expression: `v1:c == 1 ? 1 / (c - 1) : 0`,
			wantError:  "division denominator",
		},
		{
			name:       "alternate hidden negative result",
			expression: `v1:len == 1 ? -1 : 0`,
			wantError:  "can be negative",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := ValidateExpression(test.expression, "")
			require.ErrorIs(t, err, ErrInvalidExpression)
			require.ErrorContains(t, err, test.wantError)
		})
	}
}

func TestTieredExpressionValidationAllowsSignedIntermediateValues(t *testing.T) {
	for _, expression := range []string{
		`v1:abs(p - c)`,
		`v1:max(0, p - c)`,
		`v1:(-p) * (-c)`,
		`v1:tier("base", abs(p - c))`,
	} {
		_, err := ValidateExpression(expression, "")
		require.NoError(t, err, expression)
	}

	_, err := ValidateExpression(`v1:p - c`, "")
	require.ErrorIs(t, err, ErrInvalidExpression)
	require.ErrorContains(t, err, "can be negative")

	_, err = ValidateExpression(`v1:tier("base", p - c)`, "")
	require.ErrorIs(t, err, ErrInvalidExpression)
	require.ErrorContains(t, err, "tier result can be negative")
}

func TestTieredExpressionRejectsTokenParamsOutsideStaticDomain(t *testing.T) {
	_, err := RunExpression(
		`v1:p * 20`,
		"",
		TokenParams{P: math.Nextafter(maxExactExpressionTokenValue, math.Inf(1))},
		RequestInput{},
	)

	require.ErrorIs(t, err, ErrInvalidExpression)
	require.ErrorContains(t, err, "token parameter p")
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

func TestTieredProbePolicyDefaultsToDenyAndRejectsSensitiveReferences(t *testing.T) {
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
			name:       "authorization header",
			expression: `v1:has(header("Authorization"), "Bearer") ? p * 2 : p`,
			policy:     ProbePolicy{HeaderNames: []string{"Authorization"}},
			request:    RequestInput{Headers: map[string]string{"Authorization": secretValue}},
		},
		{
			name:       "x api key header",
			expression: `v1:has(header("x-api-key"), "key") ? p * 2 : p`,
			policy:     ProbePolicy{HeaderNames: []string{"x-api-key"}},
			request:    RequestInput{Headers: map[string]string{"x-api-key": secretValue}},
		},
		{
			name:       "x goog api key header",
			expression: `v1:has(header("x-goog-api-key"), "key") ? p * 2 : p`,
			policy:     ProbePolicy{HeaderNames: []string{"x-goog-api-key"}},
			request:    RequestInput{Headers: map[string]string{"x-goog-api-key": secretValue}},
		},
		{
			name:       "api key parameter",
			expression: `v1:param("api_key") == "key" ? p * 2 : p`,
			policy:     ProbePolicy{ParamPaths: []string{"api_key"}},
			request:    RequestInput{Body: []byte(`{"api_key":"must-not-appear-in-a-quote"}`)},
		},
		{
			name:       "nested secret parameter",
			expression: `v1:param("credentials.secret") == "key" ? p * 2 : p`,
			policy:     ProbePolicy{ParamPaths: []string{"credentials.secret"}},
			request:    RequestInput{Body: []byte(`{"credentials":{"secret":"must-not-appear-in-a-quote"}}`)},
		},
		{
			name:       "token parameter",
			expression: `v1:param("token") == "key" ? p * 2 : p`,
			policy:     ProbePolicy{ParamPaths: []string{"token"}},
			request:    RequestInput{Body: []byte(`{"token":"must-not-appear-in-a-quote"}`)},
		},
		{
			name:       "password parameter",
			expression: `v1:param("password") == "key" ? p * 2 : p`,
			policy:     ProbePolicy{ParamPaths: []string{"password"}},
			request:    RequestInput{Body: []byte(`{"password":"must-not-appear-in-a-quote"}`)},
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			snapshot, err := FreezeExpressionWithPolicy(test.expression, "", test.policy, TokenParams{P: 1}, test.request)
			require.ErrorIs(t, err, ErrInvalidExpression)
			require.Nil(t, snapshot)
			require.NotContains(t, err.Error(), secretValue)
		})
	}
}

func TestTieredProbePolicyAllowsExplicitNonSensitiveTokenFields(t *testing.T) {
	snapshot, err := FreezeExpressionWithPolicy(
		`v1:param("max_tokens") == 20 ? p * 20 : p`,
		"",
		ProbePolicy{ParamPaths: []string{"max_tokens"}},
		TokenParams{P: 1},
		RequestInput{Body: []byte(`{"max_tokens":20}`)},
	)

	require.NoError(t, err)
	require.Equal(t, map[string]any{"max_tokens": float64(20)}, snapshot.ParamProbes)
}

func TestTieredProbeParametersRequireOneCompleteJSONDocument(t *testing.T) {
	for _, test := range []struct {
		name string
		body []byte
	}{
		{
			name: "trailing garbage",
			body: []byte(`{"stream_options":{"fast_mode":true}} trailing`),
		},
		{
			name: "second document",
			body: []byte(`{"stream_options":{"fast_mode":true}} {"ignored":true}`),
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			snapshot, err := FreezeExpressionWithPolicy(
				`v1:param("stream_options.fast_mode") == true ? p * 2 : p`,
				"",
				ProbePolicy{ParamPaths: []string{"stream_options.fast_mode"}},
				TokenParams{P: 1},
				RequestInput{Body: test.body},
			)
			require.ErrorIs(t, err, ErrInvalidExpression)
			require.ErrorContains(t, err, "body must contain exactly one JSON document")
			require.Nil(t, snapshot)
		})
	}
}

func TestTieredRequestFunctionsFreezeOnlyReferencedValues(t *testing.T) {
	evaluationTime := time.Date(2026, time.August, 5, 1, 2, 3, 0, time.UTC)
	expression := `v1:has(header(" Anthropic-Beta "), "fast-mode") && param("stream_options.fast_mode") == true && param("limit") == 7 && has(param("tags"), "fast") && has(param("options"), "enabled") ? tier("fast", p * 2) : tier("standard", p)`
	snapshot, err := FreezeExpressionWithPolicy(
		expression,
		"",
		ProbePolicy{
			HeaderNames: []string{"Anthropic-Beta"},
			ParamPaths:  []string{"stream_options.fast_mode", "limit", "tags", "options"},
		},
		TokenParams{P: 10},
		RequestInput{
			Headers: map[string]string{
				" Anthropic-Beta ": " fast-mode-2026 ",
				"Authorization":    "Bearer not-frozen",
			},
			Body:           []byte(`{"stream_options":{"fast_mode":true},"limit":7,"tags":["fast","safe"],"options":{"enabled":true},"ignored":"not-frozen"}`),
			EvaluationTime: evaluationTime,
		},
	)
	require.NoError(t, err)
	require.Equal(t, "fast", snapshot.EstimatedTier)
	require.Equal(t, map[string]string{"anthropic-beta": "fast-mode-2026"}, snapshot.HeaderProbes)
	require.Equal(t, ProbePolicy{
		HeaderNames: []string{"anthropic-beta"},
		ParamPaths:  []string{"limit", "options", "stream_options.fast_mode", "tags"},
	}, snapshot.ProbePolicy)
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

	missing, err := RunExpressionWithPolicy(
		`v1:has(param("missing"), "x") || has("value", "") ? 2 : 1`,
		"",
		ProbePolicy{ParamPaths: []string{"missing"}},
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
