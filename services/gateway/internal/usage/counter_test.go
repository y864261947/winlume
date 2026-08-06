package usage

import (
	"sync"
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"
	"github.com/tiktoken-go/tokenizer"
	"github.com/tiktoken-go/tokenizer/codec"
)

func TestCanonicalUsageTypes(t *testing.T) {
	usage := Canonical{
		RawInputTokens:       12,
		TextInputTokens:      8,
		TextOutputTokens:     4,
		ReasoningTokens:      2,
		CacheReadTokens:      3,
		CacheWriteTokens:     5,
		CacheWrite5mTokens:   6,
		CacheWrite1hTokens:   7,
		ImageInputTokens:     9,
		ImageOutputTokens:    10,
		AudioInputTokens:     11,
		AudioOutputTokens:    12,
		Calls:                map[string]int64{"web_search": 1},
		DurationMilliseconds: 13,
		ProviderCostUSD:      decimal.RequireFromString("0.125"),
		Fields:               map[string]Provenance{"text_input_tokens": Upstream},
		Complete:             true,
		TerminalEvent:        "response.completed",
	}

	require.Equal(t, int64(8), usage.TextInputTokens)
	require.Equal(t, decimal.RequireFromString("0.125"), usage.ProviderCostUSD)
	require.Equal(t, Upstream, usage.Fields["text_input_tokens"])
	require.Equal(t, Provenance("locally_counted"), LocallyCounted)
	require.Equal(t, Provenance("request_estimate"), RequestEstimate)
	require.Equal(t, Provenance("provider_cost"), ProviderCost)
	require.Equal(t, Provenance("derived"), Derived)
}

func TestCountTextUsesOpenAITokenizerAndFallback(t *testing.T) {
	text := "Tokenizer selection should preserve punctuation: 123!"
	modelCodec, err := tokenizer.ForModel(tokenizer.Model("gpt-4o"))
	require.NoError(t, err)
	want, err := modelCodec.Count(text)
	require.NoError(t, err)
	require.Equal(t, int64(want), countText(text, "gpt-4o"))

	fallback := codec.NewCl100kBase()
	wantFallback, err := fallback.Count(text)
	require.NoError(t, err)
	require.Equal(t, int64(wantFallback), countText(text, "gpt-not-a-real-model"))
}

func TestCountTextCachesCodecsSafely(t *testing.T) {
	const workers = 32
	results := make(chan int64, workers)
	var group sync.WaitGroup
	for range workers {
		group.Add(1)
		go func() {
			defer group.Done()
			results <- countText("parallel codec cache", "gpt-4o")
		}()
	}
	group.Wait()
	close(results)

	var first int64 = -1
	for result := range results {
		if first == -1 {
			first = result
		}
		require.Equal(t, first, result)
	}
}

func TestCountTextUsesWeightedFamilyEstimator(t *testing.T) {
	tests := []struct {
		name  string
		model string
		text  string
		want  int64
	}{
		{name: "empty", model: "gemini-2.5-pro", text: "", want: 0},
		{name: "gemini CJK", model: "gemini-2.5-pro", text: "中", want: 1},
		{name: "claude CJK", model: "claude-3-7-sonnet", text: "中", want: 2},
		{name: "grok emoji uses OpenAI fallback", model: "grok-3", text: "🙂", want: 3},
		{name: "unknown math uses OpenAI fallback", model: "custom-model", text: "∑", want: 3},
		{name: "URL delimiter semantics", model: "grok-3", text: "https://example.com?a=1", want: 12},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, countText(tt.text, tt.model))
		})
	}
}
