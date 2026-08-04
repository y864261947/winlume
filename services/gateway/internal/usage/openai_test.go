package usage

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"
)

func TestOpenAIJSONNormalizesUsageDetails(t *testing.T) {
	payload, err := os.ReadFile(filepath.Join("..", "..", "testdata", "usage", "openai", "chat.json"))
	require.NoError(t, err)

	observer, err := NewRegistry().New("openai", "application/json", Estimate{Model: "gpt-4o-mini", Protocol: "openai"})
	require.NoError(t, err)
	require.NoError(t, observer.Observe(payload))

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, int64(120), actual.RawInputTokens)
	require.Equal(t, int64(85), actual.TextInputTokens)
	require.Equal(t, int64(22), actual.TextOutputTokens)
	require.Equal(t, int64(8), actual.ReasoningTokens)
	require.Equal(t, int64(20), actual.CacheReadTokens)
	require.Equal(t, int64(10), actual.ImageInputTokens)
	require.Equal(t, int64(5), actual.AudioInputTokens)
	require.Equal(t, decimal.RequireFromString("0.012345"), actual.ProviderCostUSD)
	require.Equal(t, Upstream, actual.Fields["raw_input_tokens"])
	require.Equal(t, Derived, actual.Fields["text_input_tokens"])
	require.Equal(t, Derived, actual.Fields["text_output_tokens"])
	require.Equal(t, Upstream, actual.Fields["reasoning_tokens"])
	require.Equal(t, ProviderCost, actual.Fields["provider_cost_usd"])
	require.True(t, actual.Complete)
	require.Equal(t, "json.eof", actual.TerminalEvent)
}

func TestOpenAILeavesInputTextUnsplitWhenTotalExcludesInputCategories(t *testing.T) {
	actual, err := normalizeOpenAIUsage(map[string]any{
		"prompt_tokens":     json.Number("40"),
		"completion_tokens": json.Number("20"),
		"total_tokens":      json.Number("50"),
		"prompt_tokens_details": map[string]any{
			"cached_tokens": json.Number("10"),
			"image_tokens":  json.Number("4"),
			"audio_tokens":  json.Number("2"),
		},
	}, "openai", Estimate{})
	require.NoError(t, err)
	require.Equal(t, int64(40), actual.RawInputTokens)
	require.Equal(t, int64(40), actual.TextInputTokens)
	require.Equal(t, Upstream, actual.Fields["text_input_tokens"])
	require.Equal(t, int64(10), actual.CacheReadTokens)
	require.Equal(t, int64(4), actual.ImageInputTokens)
	require.Equal(t, int64(2), actual.AudioInputTokens)
}

func TestOpenAIRejectsInvalidProviderCosts(t *testing.T) {
	for _, test := range []struct {
		name  string
		value any
	}{
		{name: "negative", value: json.Number("-0.01")},
		{name: "not a number", value: json.Number("not-a-number")},
		{name: "nan", value: "NaN"},
	} {
		t.Run(test.name, func(t *testing.T) {
			_, err := normalizeOpenAIUsage(map[string]any{"cost": test.value}, "openai", Estimate{})
			require.Error(t, err)
		})
	}
}

func TestOpenAISSEUsageOnlyTerminalChunkCompletes(t *testing.T) {
	payload, err := os.ReadFile(filepath.Join("..", "..", "testdata", "usage", "openai", "chat-terminal.sse"))
	require.NoError(t, err)

	observer, err := NewRegistry().New("openai", "text/event-stream; charset=utf-8", Estimate{Model: "gpt-4o-mini", Protocol: "openai"})
	require.NoError(t, err)
	for _, chunk := range splitUsageChunks(payload, 7, 31, 83) {
		require.NoError(t, observer.Observe(chunk))
	}

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, int64(17), actual.RawInputTokens)
	require.Equal(t, int64(17), actual.TextInputTokens)
	require.Equal(t, int64(7), actual.TextOutputTokens)
	require.True(t, actual.Complete)
	require.Equal(t, "[DONE]", actual.TerminalEvent)
}

func TestOpenAISSEWithoutUsageCountsOutputLocally(t *testing.T) {
	payload, err := os.ReadFile(filepath.Join("..", "..", "testdata", "usage", "openai", "chat-without-usage.sse"))
	require.NoError(t, err)

	estimate := Estimate{PromptTokens: 19, Model: "gpt-4o-mini", Protocol: "openai"}
	observer, err := NewRegistry().New("openai", "text/event-stream", estimate)
	require.NoError(t, err)
	for _, chunk := range splitUsageChunks(payload, 11, 101, 199) {
		require.NoError(t, observer.Observe(chunk))
	}

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, int64(19), actual.TextInputTokens)
	require.Equal(t, RequestEstimate, actual.Fields["text_input_tokens"])
	wantOutput := countText(`A local answer with reasoninglookup{"city":"Paris"}`, "gpt-4o-mini") + 7
	require.Equal(t, wantOutput, actual.TextOutputTokens)
	require.Equal(t, LocallyCounted, actual.Fields["text_output_tokens"])
	require.True(t, actual.Complete)
}

func TestResponsesJSONUsesResponsesAliasesWithoutDoubleCounting(t *testing.T) {
	payload, err := os.ReadFile(filepath.Join("..", "..", "testdata", "usage", "openai", "responses.json"))
	require.NoError(t, err)

	observer, err := NewRegistry().New("responses", "application/json", Estimate{Model: "gpt-4o-mini", Protocol: "responses"})
	require.NoError(t, err)
	require.NoError(t, observer.Observe(payload))

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, int64(200), actual.RawInputTokens)
	require.Equal(t, int64(120), actual.TextInputTokens)
	require.Equal(t, int64(56), actual.TextOutputTokens)
	require.Equal(t, int64(30), actual.CacheReadTokens)
	require.Equal(t, int64(40), actual.ImageInputTokens)
	require.Equal(t, int64(10), actual.AudioInputTokens)
	require.Equal(t, int64(15), actual.ReasoningTokens)
	require.Equal(t, int64(4), actual.ImageOutputTokens)
	require.Equal(t, int64(5), actual.AudioOutputTokens)
	require.Equal(t, Derived, actual.Fields["text_input_tokens"])
	require.Equal(t, Derived, actual.Fields["text_output_tokens"])
	require.True(t, actual.Complete)
}

func TestResponsesSSEReadsCompletedUsageAndTerminalEvent(t *testing.T) {
	payload, err := os.ReadFile(filepath.Join("..", "..", "testdata", "usage", "openai", "responses-terminal.sse"))
	require.NoError(t, err)

	observer, err := NewRegistry().New("responses", "text/event-stream", Estimate{Model: "gpt-4o-mini", Protocol: "responses"})
	require.NoError(t, err)
	for _, chunk := range splitUsageChunks(payload, 5, 71, 169) {
		require.NoError(t, observer.Observe(chunk))
	}

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, int64(33), actual.RawInputTokens)
	require.Equal(t, int64(28), actual.TextInputTokens)
	require.Equal(t, int64(8), actual.TextOutputTokens)
	require.Equal(t, int64(5), actual.CacheReadTokens)
	require.Equal(t, int64(4), actual.ReasoningTokens)
	require.True(t, actual.Complete)
	require.Equal(t, "response.completed", actual.TerminalEvent)
}

func TestResponsesSSEWithoutUsageCountsTextAndToolArgumentsLocally(t *testing.T) {
	payload, err := os.ReadFile(filepath.Join("..", "..", "testdata", "usage", "openai", "responses-without-usage.sse"))
	require.NoError(t, err)

	estimate := Estimate{PromptTokens: 23, Model: "gpt-4o-mini", Protocol: "responses"}
	observer, err := NewRegistry().New("responses", "text/event-stream", estimate)
	require.NoError(t, err)
	for _, chunk := range splitUsageChunks(payload, 29, 89, 187) {
		require.NoError(t, observer.Observe(chunk))
	}

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, int64(23), actual.TextInputTokens)
	require.Equal(t, countText(`A response {"city":"Paris"}`, "gpt-4o-mini"), actual.TextOutputTokens)
	require.Equal(t, RequestEstimate, actual.Fields["text_input_tokens"])
	require.Equal(t, LocallyCounted, actual.Fields["text_output_tokens"])
	require.True(t, actual.Complete)
}

func TestGrokUsesOpenAIUsageAndDerivesMissingCompletionTokens(t *testing.T) {
	payload, err := os.ReadFile(filepath.Join("..", "..", "testdata", "usage", "openai", "grok.json"))
	require.NoError(t, err)

	observer, err := NewRegistry().New("grok", "application/json", Estimate{Model: "grok-3-mini", Protocol: "openai"})
	require.NoError(t, err)
	require.NoError(t, observer.Observe(payload))

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, int64(50), actual.RawInputTokens)
	require.Equal(t, int64(40), actual.TextInputTokens)
	require.Equal(t, int64(10), actual.TextOutputTokens)
	require.Equal(t, int64(2), actual.ReasoningTokens)
	require.Equal(t, Derived, actual.Fields["text_output_tokens"])
	require.True(t, actual.Complete)
}

func TestGrokEmptyUsageObjectFallsBackToEstimatedInputAndLocalOutput(t *testing.T) {
	payload, err := os.ReadFile(filepath.Join("..", "..", "testdata", "usage", "openai", "grok-empty-usage.json"))
	require.NoError(t, err)

	estimate := Estimate{PromptTokens: 29, Model: "grok-3-mini", Protocol: "openai"}
	observer, err := NewRegistry().New("xai", "application/json", estimate)
	require.NoError(t, err)
	require.NoError(t, observer.Observe(payload))

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, int64(29), actual.TextInputTokens)
	require.Equal(t, countText("Fallback from a sanitized Grok response. Short reasoning.", "grok-3-mini"), actual.TextOutputTokens)
	require.Equal(t, RequestEstimate, actual.Fields["text_input_tokens"])
	require.Equal(t, LocallyCounted, actual.Fields["text_output_tokens"])
	require.True(t, actual.Complete)
}

func TestOpenAIDisconnectedStreamReturnsPartialLocallyCountedUsage(t *testing.T) {
	payload, err := os.ReadFile(filepath.Join("..", "..", "testdata", "usage", "openai", "chat-disconnected.sse"))
	require.NoError(t, err)

	estimate := Estimate{PromptTokens: 31, Model: "gpt-4o-mini", Protocol: "openai"}
	observer, err := NewRegistry().New("openai", "text/event-stream", estimate)
	require.NoError(t, err)
	require.NoError(t, observer.Observe(payload))

	actual, err := observer.Complete(Completion{StatusCode: 200, ClientDisconnected: true})
	require.NoError(t, err)
	require.Equal(t, int64(31), actual.TextInputTokens)
	require.Equal(t, countText("Partial answer", "gpt-4o-mini"), actual.TextOutputTokens)
	require.Equal(t, RequestEstimate, actual.Fields["text_input_tokens"])
	require.Equal(t, LocallyCounted, actual.Fields["text_output_tokens"])
	require.False(t, actual.Complete)
	require.Equal(t, "client_disconnected", actual.TerminalEvent)
}

func TestOpenAISSEWithoutTerminalReportsEOFWithoutTerminal(t *testing.T) {
	observer, err := NewRegistry().New("openai", "text/event-stream", Estimate{PromptTokens: 31, Model: "gpt-4o-mini", Protocol: "openai"})
	require.NoError(t, err)
	require.NoError(t, observer.Observe([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"Partial answer\"}}]}\n\n")))

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, int64(31), actual.TextInputTokens)
	require.Equal(t, countText("Partial answer", "gpt-4o-mini"), actual.TextOutputTokens)
	require.False(t, actual.Complete)
	require.Equal(t, "eof_without_terminal", actual.TerminalEvent)
}

func TestOpenAIMalformedSSEReturnsPartialUsageWithoutCompleting(t *testing.T) {
	payload, err := os.ReadFile(filepath.Join("..", "..", "testdata", "usage", "openai", "chat-malformed.sse"))
	require.NoError(t, err)

	estimate := Estimate{PromptTokens: 37, Model: "gpt-4o-mini", Protocol: "openai"}
	observer, err := NewRegistry().New("openai", "text/event-stream", estimate)
	require.NoError(t, err)
	require.ErrorIs(t, observer.Observe(payload), ErrMalformedSSE)

	actual, completeErr := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.ErrorIs(t, completeErr, ErrMalformedSSE)
	require.Equal(t, int64(37), actual.TextInputTokens)
	require.Equal(t, countText("Safe partial", "gpt-4o-mini"), actual.TextOutputTokens)
	require.False(t, actual.Complete)
	require.Equal(t, "malformed_sse", actual.TerminalEvent)
}

func TestOpenAIRejectsSSEEventsLargerThanBound(t *testing.T) {
	observer, err := NewRegistry().New("openai", "text/event-stream", Estimate{Model: "gpt-4o-mini", Protocol: "openai"})
	require.NoError(t, err)
	require.ErrorIs(t, observer.Observe([]byte("data: "+strings.Repeat("x", maxSSEEventBytes))), ErrSSEEventTooLarge)

	actual, completeErr := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.ErrorIs(t, completeErr, ErrSSEEventTooLarge)
	require.False(t, actual.Complete)
	require.Equal(t, "malformed_sse", actual.TerminalEvent)
}

func TestOpenAIJSONSpillsLargeResponseBeforeNormalization(t *testing.T) {
	payload := []byte(`{"choices":[{"message":{"content":"ok"}}],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5},"padding":"` + strings.Repeat("x", 1024*1024) + `"}`)
	observer, err := NewRegistry().New("openai", "application/json", Estimate{Model: "gpt-4o-mini", Protocol: "openai"})
	require.NoError(t, err)
	require.NoError(t, observer.Observe(payload))

	openAI := observer.(*openAIObserver)
	require.False(t, openAI.body.InMemory())
	spillPath := openAI.body.path
	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, int64(3), actual.TextInputTokens)
	require.Equal(t, int64(2), actual.TextOutputTokens)
	require.NoFileExists(t, spillPath)
}

func splitUsageChunks(payload []byte, cuts ...int) [][]byte {
	chunks := make([][]byte, 0, len(cuts)+1)
	start := 0
	for _, cut := range cuts {
		if cut > len(payload) {
			cut = len(payload)
		}
		chunks = append(chunks, payload[start:cut])
		start = cut
	}
	if start < len(payload) {
		chunks = append(chunks, payload[start:])
	}
	return chunks
}
