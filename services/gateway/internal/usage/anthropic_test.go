package usage

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestAnthropicJSONNormalizesNativeUsage(t *testing.T) {
	payload, err := os.ReadFile(filepath.Join("..", "..", "testdata", "usage", "anthropic", "message.json"))
	require.NoError(t, err)

	observer, err := NewRegistry().New("anthropic", "application/json", Estimate{Model: "claude-sonnet-4-20250514", Protocol: "claude"})
	require.NoError(t, err)
	require.NoError(t, observer.Observe(payload))

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, int64(100), actual.RawInputTokens)
	require.Equal(t, int64(100), actual.TextInputTokens)
	require.Equal(t, int64(20), actual.TextOutputTokens)
	require.Equal(t, int64(30), actual.CacheReadTokens)
	require.Equal(t, int64(50), actual.CacheWriteTokens)
	require.Equal(t, int64(10), actual.CacheWrite5mTokens)
	require.Equal(t, int64(20), actual.CacheWrite1hTokens)
	require.Equal(t, int64(2), actual.Calls["web_search"])
	require.Equal(t, Upstream, actual.Fields["raw_input_tokens"])
	require.Equal(t, Upstream, actual.Fields["text_input_tokens"])
	require.Equal(t, Upstream, actual.Fields["text_output_tokens"])
	require.Equal(t, Upstream, actual.Fields["calls.web_search"])
	require.True(t, actual.ProviderCostUSD.IsZero())
	require.NotContains(t, actual.Fields, "provider_cost_usd")
	require.True(t, actual.Complete)
	require.Equal(t, "json.eof", actual.TerminalEvent)
}

func TestAnthropicSSEMergesStartAndMessageDeltaUsage(t *testing.T) {
	payload, err := os.ReadFile(filepath.Join("..", "..", "testdata", "usage", "anthropic", "stream-terminal.sse"))
	require.NoError(t, err)

	observer, err := NewRegistry().New("claude", "text/event-stream; charset=utf-8", Estimate{Model: "claude-sonnet-4-20250514", Protocol: "claude"})
	require.NoError(t, err)
	for _, chunk := range splitUsageChunks(payload, 13, 103, 271, 509) {
		require.NoError(t, observer.Observe(chunk))
	}

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, int64(100), actual.RawInputTokens)
	require.Equal(t, int64(100), actual.TextInputTokens)
	require.Equal(t, int64(200), actual.TextOutputTokens)
	require.Equal(t, int64(30), actual.CacheReadTokens)
	require.Equal(t, int64(50), actual.CacheWriteTokens)
	require.Equal(t, int64(10), actual.CacheWrite5mTokens)
	require.Equal(t, int64(20), actual.CacheWrite1hTokens)
	require.Equal(t, int64(2), actual.Calls["web_search"])
	require.True(t, actual.Complete)
	require.Equal(t, "message_stop", actual.TerminalEvent)
}

func TestAnthropicJSONUsesRequestEstimateWhenInputUsageIsMissing(t *testing.T) {
	payload, err := os.ReadFile(filepath.Join("..", "..", "testdata", "usage", "anthropic", "missing-input.json"))
	require.NoError(t, err)

	observer, err := NewRegistry().New("claude", "application/json", Estimate{PromptTokens: 17, Model: "claude-sonnet-4-20250514", Protocol: "claude"})
	require.NoError(t, err)
	require.NoError(t, observer.Observe(payload))

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, int64(17), actual.TextInputTokens)
	require.Equal(t, RequestEstimate, actual.Fields["text_input_tokens"])
	require.Equal(t, int64(7), actual.TextOutputTokens)
	require.Equal(t, Upstream, actual.Fields["text_output_tokens"])
	require.True(t, actual.Complete)
	require.Equal(t, "json.eof", actual.TerminalEvent)
}

func TestAnthropicSSECountsContentBlockStartTextWhenOutputUsageIsMissing(t *testing.T) {
	payload, err := os.ReadFile(filepath.Join("..", "..", "testdata", "usage", "anthropic", "missing-output.sse"))
	require.NoError(t, err)

	observer, err := NewRegistry().New("anthropic", "text/event-stream", Estimate{Model: "claude-sonnet-4-20250514", Protocol: "claude"})
	require.NoError(t, err)
	require.NoError(t, observer.Observe(payload))

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, int64(10), actual.TextInputTokens)
	require.Equal(t, countText("中", "claude-sonnet-4-20250514"), actual.TextOutputTokens)
	require.Equal(t, LocallyCounted, actual.Fields["text_output_tokens"])
	require.True(t, actual.Complete)
	require.Equal(t, "message_stop", actual.TerminalEvent)
}

func TestAnthropicSSECountsThinkingAndToolJSONWhenOutputUsageIsMissing(t *testing.T) {
	payload, err := os.ReadFile(filepath.Join("..", "..", "testdata", "usage", "anthropic", "missing-output-tool-thinking.sse"))
	require.NoError(t, err)

	observer, err := NewRegistry().New("anthropic", "text/event-stream", Estimate{Model: "claude-sonnet-4-20250514", Protocol: "claude"})
	require.NoError(t, err)
	require.NoError(t, observer.Observe(payload))
	require.Equal(t, `reasonlookup{"city":"Paris"}`, observer.(*anthropicObserver).anthropicStreamFallbackText())

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, countText(`reasonlookup{"city":"Paris"}`, "claude-sonnet-4-20250514"), actual.TextOutputTokens)
	require.Equal(t, LocallyCounted, actual.Fields["text_output_tokens"])
	require.True(t, actual.Complete)
	require.Equal(t, "message_stop", actual.TerminalEvent)
}

func TestAnthropicJSONCountsContentWhenOutputUsageIsMissing(t *testing.T) {
	payload, err := os.ReadFile(filepath.Join("..", "..", "testdata", "usage", "anthropic", "missing-output.json"))
	require.NoError(t, err)

	observer, err := NewRegistry().New("claude", "application/json", Estimate{Model: "claude-sonnet-4-20250514", Protocol: "claude"})
	require.NoError(t, err)
	require.NoError(t, observer.Observe(payload))

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, int64(10), actual.TextInputTokens)
	require.Equal(t, countText("JSON fallback", "claude-sonnet-4-20250514"), actual.TextOutputTokens)
	require.Equal(t, LocallyCounted, actual.Fields["text_output_tokens"])
	require.True(t, actual.Complete)
	require.Equal(t, "json.eof", actual.TerminalEvent)
}

func TestAnthropicJSONCountsTextThinkingAndToolUseWhenOutputUsageIsMissing(t *testing.T) {
	payload, err := os.ReadFile(filepath.Join("..", "..", "testdata", "usage", "anthropic", "mixed-fallback.json"))
	require.NoError(t, err)

	observer, err := NewRegistry().New("claude", "application/json", Estimate{Model: "claude-sonnet-4-20250514", Protocol: "claude"})
	require.NoError(t, err)
	require.NoError(t, observer.Observe(payload))

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, countText(`answer reason lookup{"a":1,"b":2}`, "claude-sonnet-4-20250514"), actual.TextOutputTokens)
	require.Equal(t, LocallyCounted, actual.Fields["text_output_tokens"])
	require.True(t, actual.Complete)
}

func TestAnthropicJSONRejectsNonObjectTopLevelUsage(t *testing.T) {
	for _, test := range []struct {
		name    string
		payload []byte
	}{
		{name: "scalar", payload: []byte(`{"content":[{"type":"text","text":"fallback"}],"usage":1}`)},
		{name: "array", payload: []byte(`{"content":[{"type":"text","text":"fallback"}],"usage":[]}`)},
	} {
		t.Run(test.name, func(t *testing.T) {
			observer, err := NewRegistry().New("anthropic", "application/json", Estimate{Model: "claude-sonnet-4-20250514", Protocol: "claude"})
			require.NoError(t, err)
			require.NoError(t, observer.Observe(test.payload))

			actual, completeErr := observer.Complete(Completion{StatusCode: 200, EOF: true})
			require.EqualError(t, completeErr, "Anthropic usage usage must be an object")
			require.False(t, actual.Complete)
		})
	}
}

func TestAnthropicJSONAllowsMissingOrNullTopLevelUsageFallback(t *testing.T) {
	for _, test := range []struct {
		name    string
		payload []byte
	}{
		{name: "missing", payload: []byte(`{"content":[{"type":"text","text":"fallback"}]}`)},
		{name: "null", payload: []byte(`{"content":[{"type":"text","text":"fallback"}],"usage":null}`)},
	} {
		t.Run(test.name, func(t *testing.T) {
			observer, err := NewRegistry().New("anthropic", "application/json", Estimate{Model: "claude-sonnet-4-20250514", Protocol: "claude"})
			require.NoError(t, err)
			require.NoError(t, observer.Observe(test.payload))

			actual, completeErr := observer.Complete(Completion{StatusCode: 200, EOF: true})
			require.NoError(t, completeErr)
			require.Equal(t, countText("fallback", "claude-sonnet-4-20250514"), actual.TextOutputTokens)
			require.Equal(t, LocallyCounted, actual.Fields["text_output_tokens"])
			require.True(t, actual.Complete)
		})
	}
}

func TestAnthropicSSECountsToolStartInputWhenNoPartialJSONArrives(t *testing.T) {
	payload, err := os.ReadFile(filepath.Join("..", "..", "testdata", "usage", "anthropic", "tool-start-input.sse"))
	require.NoError(t, err)

	observer, err := NewRegistry().New("anthropic", "text/event-stream", Estimate{Model: "claude-sonnet-4-20250514", Protocol: "claude"})
	require.NoError(t, err)
	require.NoError(t, observer.Observe(payload))

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, countText(`lookup{"city":"Paris"}`, "claude-sonnet-4-20250514"), actual.TextOutputTokens)
	require.Equal(t, LocallyCounted, actual.Fields["text_output_tokens"])
	require.True(t, actual.Complete)
}

func TestAnthropicSSEWithoutMessageStopReturnsPartialUsage(t *testing.T) {
	payload, err := os.ReadFile(filepath.Join("..", "..", "testdata", "usage", "anthropic", "disconnected.sse"))
	require.NoError(t, err)

	for _, test := range []struct {
		name       string
		completion Completion
		terminal   string
	}{
		{name: "client disconnected", completion: Completion{StatusCode: 200, ClientDisconnected: true}, terminal: "client_disconnected"},
		{name: "relay error", completion: Completion{StatusCode: 200, Err: errors.New("relay write failed")}, terminal: "relay_error"},
		{name: "eof without stop", completion: Completion{StatusCode: 200, EOF: true}, terminal: "eof_without_message_stop"},
	} {
		t.Run(test.name, func(t *testing.T) {
			observer, err := NewRegistry().New("anthropic", "text/event-stream", Estimate{Model: "claude-sonnet-4-20250514", Protocol: "claude"})
			require.NoError(t, err)
			require.NoError(t, observer.Observe(payload))

			actual, err := observer.Complete(test.completion)
			require.NoError(t, err)
			require.Equal(t, int64(13), actual.TextInputTokens)
			require.Equal(t, countText("Partial answer", "claude-sonnet-4-20250514"), actual.TextOutputTokens)
			require.Equal(t, LocallyCounted, actual.Fields["text_output_tokens"])
			require.False(t, actual.Complete)
			require.Equal(t, test.terminal, actual.TerminalEvent)
		})
	}
}

func TestAnthropicSSEMessageDeltaDoesNotCompleteWithoutMessageStop(t *testing.T) {
	observer, err := NewRegistry().New("anthropic", "text/event-stream", Estimate{Model: "claude-sonnet-4-20250514", Protocol: "claude"})
	require.NoError(t, err)
	payload := []byte("event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"usage\":{\"input_tokens\":3}}}\n\n" +
		"event: message_delta\ndata: {\"type\":\"message_delta\",\"usage\":{\"output_tokens\":2}}\n\n")
	require.NoError(t, observer.Observe(payload))

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, int64(3), actual.TextInputTokens)
	require.Equal(t, int64(2), actual.TextOutputTokens)
	require.False(t, actual.Complete)
	require.Equal(t, "eof_without_message_stop", actual.TerminalEvent)
}

func TestAnthropicSSERejectsMessageDeltaAndStopBeforeStart(t *testing.T) {
	deltaPayload, err := os.ReadFile(filepath.Join("..", "..", "testdata", "usage", "anthropic", "malformed-order.sse"))
	require.NoError(t, err)

	for _, test := range []struct {
		name    string
		payload []byte
	}{
		{name: "message delta", payload: deltaPayload},
		{name: "message stop", payload: []byte("event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n")},
	} {
		t.Run(test.name, func(t *testing.T) {
			observer, err := NewRegistry().New("anthropic", "text/event-stream", Estimate{Model: "claude-sonnet-4-20250514", Protocol: "claude"})
			require.NoError(t, err)
			require.ErrorIs(t, observer.Observe(test.payload), ErrAnthropicEventOrder)

			actual, completeErr := observer.Complete(Completion{StatusCode: 200, EOF: true})
			require.ErrorIs(t, completeErr, ErrAnthropicEventOrder)
			require.False(t, actual.Complete)
			require.Equal(t, "malformed_sse", actual.TerminalEvent)
		})
	}
}

func TestAnthropicSSEEnforcesLifecycleTransitions(t *testing.T) {
	start := []byte("event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"usage\":{\"input_tokens\":3}}}\n\n")
	stop := []byte("event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n")
	delta := []byte("event: message_delta\ndata: {\"type\":\"message_delta\",\"usage\":{\"output_tokens\":2}}\n\n")

	for _, test := range []struct {
		name    string
		payload []byte
	}{
		{name: "repeated start", payload: append(append([]byte(nil), start...), start...)},
		{name: "delta after stop", payload: append(append([]byte(nil), start...), append(stop, delta...)...)},
	} {
		t.Run(test.name, func(t *testing.T) {
			observer, err := NewRegistry().New("anthropic", "text/event-stream", Estimate{Model: "claude-sonnet-4-20250514", Protocol: "claude"})
			require.NoError(t, err)
			require.ErrorIs(t, observer.Observe(test.payload), ErrAnthropicEventOrder)

			actual, completeErr := observer.Complete(Completion{StatusCode: 200, EOF: true})
			require.ErrorIs(t, completeErr, ErrAnthropicEventOrder)
			require.False(t, actual.Complete)
		})
	}

	observer, err := NewRegistry().New("anthropic", "text/event-stream", Estimate{Model: "claude-sonnet-4-20250514", Protocol: "claude"})
	require.NoError(t, err)
	require.ErrorIs(t, observer.Observe(append(append([]byte(nil), start...), stop...)), ErrAnthropicEventOrder)
	actual, completeErr := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.ErrorIs(t, completeErr, ErrAnthropicEventOrder)
	require.False(t, actual.Complete)
}

func TestAnthropicSSEEnforcesContentBlockTransitions(t *testing.T) {
	start := []byte("event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"usage\":{\"input_tokens\":3}}}\n\n")
	blockStart := []byte("event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\"}}\n\n")
	blockDelta := []byte("event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"x\"}}\n\n")
	blockStop := []byte("event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n")
	messageDelta := []byte("event: message_delta\ndata: {\"type\":\"message_delta\",\"usage\":{\"output_tokens\":2}}\n\n")
	messageStop := []byte("event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n")

	for _, test := range []struct {
		name    string
		payload []byte
	}{
		{name: "repeated block start", payload: append(append(append(append([]byte(nil), start...), blockStart...), blockStop...), blockStart...)},
		{name: "block delta without start", payload: append(append([]byte(nil), start...), blockDelta...)},
		{name: "block stop without start", payload: append(append([]byte(nil), start...), blockStop...)},
		{name: "block delta after stop", payload: append(append(append(append([]byte(nil), start...), blockStart...), blockStop...), blockDelta...)},
		{name: "message delta with open block", payload: append(append(append([]byte(nil), start...), blockStart...), messageDelta...)},
		{name: "message stop with open block", payload: append(append(append([]byte(nil), start...), blockStart...), messageStop...)},
	} {
		t.Run(test.name, func(t *testing.T) {
			observer, err := NewRegistry().New("anthropic", "text/event-stream", Estimate{Model: "claude-sonnet-4-20250514", Protocol: "claude"})
			require.NoError(t, err)
			require.ErrorIs(t, observer.Observe(test.payload), ErrAnthropicEventOrder)
		})
	}
}

func TestAnthropicSSERejectsNonSequentialContentBlockFlows(t *testing.T) {
	messageStart := "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"usage\":{\"input_tokens\":3}}}\n\n"
	blockZeroStart := "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"zero\"}}\n\n"
	blockOneStart := "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"text\",\"text\":\"one\"}}\n\n"
	blockZeroDelta := "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"!\"}}\n\n"
	blockZeroStop := "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n"
	blockOneStop := "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":1}\n\n"
	messageDelta := "event: message_delta\ndata: {\"type\":\"message_delta\",\"usage\":{}}\n\n"
	messageStop := "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"

	for _, test := range []struct {
		name    string
		payload []byte
	}{
		{name: "first block starts at one", payload: []byte(messageStart + blockOneStart + blockOneStop + messageDelta + messageStop)},
		{name: "second block starts before first stops", payload: []byte(messageStart + blockZeroStart + blockOneStart + blockZeroStop + blockOneStop + messageDelta + messageStop)},
		{name: "interleaved delta and stop target different blocks", payload: []byte(messageStart + blockZeroStart + blockOneStart + blockZeroDelta + blockOneStop + blockZeroStop + messageDelta + messageStop)},
	} {
		t.Run(test.name, func(t *testing.T) {
			observer, err := NewRegistry().New("anthropic", "text/event-stream", Estimate{Model: "claude-sonnet-4-20250514", Protocol: "claude"})
			require.NoError(t, err)

			observeErr := observer.Observe(test.payload)
			actual, completeErr := observer.Complete(Completion{StatusCode: 200, EOF: true})
			require.ErrorIs(t, observeErr, ErrAnthropicEventOrder)
			require.ErrorIs(t, completeErr, ErrAnthropicEventOrder)
			require.False(t, actual.Complete)
		})
	}
}

func TestAnthropicSSEAcceptsSequentialContentBlockIndexes(t *testing.T) {
	payload := []byte("event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"usage\":{\"input_tokens\":3}}}\n\n" +
		"event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"zero\"}}\n\n" +
		"event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"!\"}}\n\n" +
		"event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n" +
		"event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"text\",\"text\":\"one\"}}\n\n" +
		"event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":1}\n\n" +
		"event: message_delta\ndata: {\"type\":\"message_delta\",\"usage\":{}}\n\n" +
		"event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n")

	observer, err := NewRegistry().New("anthropic", "text/event-stream", Estimate{Model: "claude-sonnet-4-20250514", Protocol: "claude"})
	require.NoError(t, err)
	require.NoError(t, observer.Observe(payload))
	require.Equal(t, "zero!one", observer.(*anthropicObserver).anthropicStreamFallbackText())

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, countText("zero!one", "claude-sonnet-4-20250514"), actual.TextOutputTokens)
	require.Equal(t, LocallyCounted, actual.Fields["text_output_tokens"])
	require.True(t, actual.Complete)
}

func TestAnthropicSSEZeroUsageCompletesWithoutFallback(t *testing.T) {
	payload, err := os.ReadFile(filepath.Join("..", "..", "testdata", "usage", "anthropic", "zero-usage.sse"))
	require.NoError(t, err)

	observer, err := NewRegistry().New("anthropic", "text/event-stream", Estimate{PromptTokens: 17, Model: "claude-sonnet-4-20250514", Protocol: "claude"})
	require.NoError(t, err)
	require.NoError(t, observer.Observe(payload))

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Zero(t, actual.RawInputTokens)
	require.Zero(t, actual.TextInputTokens)
	require.Zero(t, actual.TextOutputTokens)
	require.Zero(t, actual.CacheReadTokens)
	require.Zero(t, actual.CacheWriteTokens)
	require.Zero(t, actual.CacheWrite5mTokens)
	require.Zero(t, actual.CacheWrite1hTokens)
	require.Empty(t, actual.Calls)
	require.True(t, actual.Complete)
	require.Equal(t, "message_stop", actual.TerminalEvent)
}

func TestAnthropicJSONUsesLargerCacheCreationSplitTotal(t *testing.T) {
	payload, err := os.ReadFile(filepath.Join("..", "..", "testdata", "usage", "anthropic", "cache-split.json"))
	require.NoError(t, err)

	observer, err := NewRegistry().New("anthropic", "application/json", Estimate{Model: "claude-sonnet-4-20250514", Protocol: "claude"})
	require.NoError(t, err)
	require.NoError(t, observer.Observe(payload))

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, int64(30), actual.CacheWriteTokens)
	require.Equal(t, int64(10), actual.CacheWrite5mTokens)
	require.Equal(t, int64(20), actual.CacheWrite1hTokens)
	require.True(t, actual.Complete)
}

func TestAnthropicSSERejectsEventsLargerThanBound(t *testing.T) {
	registry := NewRegistryWithLimits(Limits{MaxEventBytes: 64})
	observer, err := registry.New("anthropic", "text/event-stream", Estimate{Model: "claude-sonnet-4-20250514", Protocol: "claude"})
	require.NoError(t, err)
	require.ErrorIs(t, observer.Observe([]byte("data: "+strings.Repeat("x", 64))), ErrSSEEventTooLarge)

	actual, completeErr := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.ErrorIs(t, completeErr, ErrSSEEventTooLarge)
	require.False(t, actual.Complete)
	require.Equal(t, "malformed_sse", actual.TerminalEvent)
}

func TestAnthropicSSEStopsRetainingFallbackAfterCumulativeLimit(t *testing.T) {
	registry := NewRegistryWithLimits(Limits{MaxFallbackBytes: 150})
	observer, err := registry.New("anthropic", "text/event-stream", Estimate{Model: "claude-sonnet-4-20250514", Protocol: "claude"})
	require.NoError(t, err)
	require.NoError(t, observer.Observe([]byte("event: message_start\ndata: {\"type\":\"message_start\",\"message\":{}}\n\n")))
	require.NoError(t, observer.Observe([]byte("event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\"}}\n\n")))
	require.NoError(t, observer.Observe([]byte("event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"first\"}}\n\n")))
	require.ErrorIs(t, observer.Observe([]byte("event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"second\"}}\n\n")), ErrObservationLimitExceeded)

	actual, completeErr := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.ErrorIs(t, completeErr, ErrObservationLimitExceeded)
	require.False(t, actual.Complete)
	require.Equal(t, "observation_limit_exceeded", actual.TerminalEvent)
}

func TestAnthropicJSONSpillsLargeResponseBeforeNormalization(t *testing.T) {
	payload := []byte(`{"usage":{"input_tokens":3,"output_tokens":2},"padding":"` + strings.Repeat("x", 512) + `"}`)
	registry := NewRegistryWithLimits(Limits{MaxResponseBytes: 1_024, SpillThresholdBytes: 1})
	observer, err := registry.New("anthropic", "application/json", Estimate{Model: "claude-sonnet-4-20250514", Protocol: "claude"})
	require.NoError(t, err)
	require.NoError(t, observer.Observe(payload))

	anthropic := observer.(*anthropicObserver)
	require.False(t, anthropic.body.InMemory())
	spillPath := anthropic.body.path
	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, int64(3), actual.TextInputTokens)
	require.Equal(t, int64(2), actual.TextOutputTokens)
	require.NoFileExists(t, spillPath)
}

func TestAnthropicJSONRejectsResponseAcrossObservationLimit(t *testing.T) {
	registry := NewRegistryWithLimits(Limits{MaxResponseBytes: 10})
	observer, err := registry.New("anthropic", "application/json", Estimate{PromptTokens: 7, Model: "claude-sonnet-4-20250514", Protocol: "claude"})
	require.NoError(t, err)
	require.NoError(t, observer.Observe([]byte(`{"usage":`)))
	require.ErrorIs(t, observer.Observe([]byte(`{}}`)), ErrObservationLimitExceeded)
	require.ErrorIs(t, observer.Observe([]byte(`x`)), ErrObservationLimitExceeded)

	actual, completeErr := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.ErrorIs(t, completeErr, ErrObservationLimitExceeded)
	require.False(t, actual.Complete)
	require.Equal(t, "observation_limit_exceeded", actual.TerminalEvent)
}
