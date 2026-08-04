package usage

import (
	"bytes"
	"errors"
	"fmt"
	"math"
	"strings"
	"sync"
)

var ErrAnthropicEventOrder = errors.New("invalid Anthropic SSE event order")

type anthropicObserver struct {
	estimate      Estimate
	limits        Limits
	stream        bool
	body          *responseStore
	sse           sseDecoder
	usage         anthropicUsageSnapshot
	sawStart      bool
	sawStop       bool
	observeErr    error
	localText     strings.Builder
	fallbackBytes int64
	finalized     bool
	mu            sync.Mutex
}

type anthropicUsageValue struct {
	value   int64
	present bool
}

type anthropicUsageSnapshot struct {
	input         anthropicUsageValue
	output        anthropicUsageValue
	cacheRead     anthropicUsageValue
	cacheCreation anthropicUsageValue
	cache5m       anthropicUsageValue
	cache1h       anthropicUsageValue
	webSearch     anthropicUsageValue
}

func newAnthropicObserverWithLimits(contentType string, estimate Estimate, limits Limits) *anthropicObserver {
	limits = normalizeLimits(limits)
	return &anthropicObserver{
		estimate: estimate,
		limits:   limits,
		stream:   isSSEContentType(contentType),
		body:     newResponseStoreWithLimits(limits),
		sse:      sseDecoder{maxEventBytes: limits.MaxEventBytes},
	}
}

func (observer *anthropicObserver) Observe(chunk []byte) error {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	if observer.finalized {
		return ErrObserverFinalized
	}
	if observer.observeErr != nil {
		return observer.observeErr
	}
	if observer.stream {
		err := observer.sse.Observe(chunk, observer.observeSSEEvent)
		if err != nil {
			observer.observeErr = err
		}
		return err
	}
	_, err := observer.body.Write(chunk)
	return err
}

func (observer *anthropicObserver) Complete(completion Completion) (Canonical, error) {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	if observer.finalized {
		return Canonical{Fields: make(map[string]Provenance)}, ErrObserverFinalized
	}
	observer.finalized = true
	defer observer.body.Close()

	if observer.stream {
		return observer.completeSSE(completion)
	}
	if terminal := incompleteCompletionTerminal(completion); terminal != "" {
		result, _ := normalizeAnthropicUsage(nil, observer.estimate)
		result.TerminalEvent = terminal
		return result, nil
	}
	if err := observer.body.ObservationError(); err != nil {
		return Canonical{Fields: make(map[string]Provenance), TerminalEvent: "observation_limit_exceeded"}, err
	}
	body, err := observer.body.Open()
	if err != nil {
		return Canonical{Fields: make(map[string]Provenance)}, err
	}
	defer body.Close()

	response, err := decodeStrictJSONObject(body)
	if err != nil {
		return Canonical{Fields: make(map[string]Provenance)}, fmt.Errorf("decode Anthropic response: %w", err)
	}
	usage, _ := objectValue(response["usage"])
	snapshot, err := parseAnthropicUsage(usage)
	if err != nil {
		return Canonical{Fields: make(map[string]Provenance)}, err
	}
	result, err := normalizeAnthropicSnapshot(snapshot, observer.estimate)
	if err != nil {
		return result, err
	}
	if !snapshot.output.present {
		if err := observer.collectAnthropicJSONText(response); err != nil {
			result.TerminalEvent = "observation_limit_exceeded"
			return result, err
		}
		observer.applyAnthropicOutputFallback(&result)
	}
	result.Complete = true
	result.TerminalEvent = "json.eof"
	return result, nil
}

func normalizeAnthropicUsage(document map[string]any, estimate Estimate) (Canonical, error) {
	snapshot, err := parseAnthropicUsage(document)
	if err != nil {
		return Canonical{Fields: make(map[string]Provenance)}, err
	}
	return normalizeAnthropicSnapshot(snapshot, estimate)
}

func parseAnthropicUsage(document map[string]any) (anthropicUsageSnapshot, error) {
	var snapshot anthropicUsageSnapshot
	if document == nil {
		return snapshot, nil
	}
	var err error
	if snapshot.input, err = anthropicUsageField(document, "input_tokens"); err != nil {
		return snapshot, err
	}
	if snapshot.output, err = anthropicUsageField(document, "output_tokens"); err != nil {
		return snapshot, err
	}
	if snapshot.cacheRead, err = anthropicUsageField(document, "cache_read_input_tokens"); err != nil {
		return snapshot, err
	}
	if snapshot.cacheCreation, err = anthropicUsageField(document, "cache_creation_input_tokens"); err != nil {
		return snapshot, err
	}
	cacheCreation, present, err := anthropicUsageObject(document, "cache_creation")
	if err != nil {
		return snapshot, err
	}
	if present {
		if snapshot.cache5m, err = anthropicUsageField(cacheCreation, "ephemeral_5m_input_tokens"); err != nil {
			return snapshot, err
		}
		if snapshot.cache1h, err = anthropicUsageField(cacheCreation, "ephemeral_1h_input_tokens"); err != nil {
			return snapshot, err
		}
	}
	serverToolUse, present, err := anthropicUsageObject(document, "server_tool_use")
	if err != nil {
		return snapshot, err
	}
	if present {
		if snapshot.webSearch, err = anthropicUsageField(serverToolUse, "web_search_requests"); err != nil {
			return snapshot, err
		}
	}
	return snapshot, nil
}

func anthropicUsageField(document map[string]any, name string) (anthropicUsageValue, error) {
	value, present, err := nonNegativeInt64(document, name)
	if err != nil {
		return anthropicUsageValue{}, fmt.Errorf("Anthropic usage %s: %w", name, err)
	}
	return anthropicUsageValue{value: value, present: present}, nil
}

func anthropicUsageObject(document map[string]any, name string) (map[string]any, bool, error) {
	value, present := document[name]
	if !present || value == nil {
		return nil, false, nil
	}
	object, ok := objectValue(value)
	if !ok {
		return nil, true, fmt.Errorf("Anthropic usage %s must be an object", name)
	}
	return object, true, nil
}

func normalizeAnthropicSnapshot(snapshot anthropicUsageSnapshot, estimate Estimate) (Canonical, error) {
	result := Canonical{Fields: make(map[string]Provenance)}
	if snapshot.input.present {
		result.RawInputTokens = snapshot.input.value
		result.Fields["raw_input_tokens"] = Upstream
		result.TextInputTokens = snapshot.input.value
		if snapshot.input.value > 0 {
			result.Fields["text_input_tokens"] = Upstream
		}
	} else if estimate.PromptTokens > 0 {
		result.TextInputTokens = estimate.PromptTokens
		result.Fields["text_input_tokens"] = RequestEstimate
	}

	if snapshot.output.present {
		result.TextOutputTokens = snapshot.output.value
		if snapshot.output.value > 0 {
			result.Fields["text_output_tokens"] = Upstream
		}
	}

	if snapshot.cacheRead.present {
		result.CacheReadTokens = snapshot.cacheRead.value
		if snapshot.cacheRead.value > 0 {
			result.Fields["cache_read_tokens"] = Upstream
		}
	}

	cacheSplit, err := anthropicTokenSum(snapshot.cache5m.value, snapshot.cache1h.value)
	if err != nil {
		return result, err
	}
	if snapshot.cache5m.present {
		result.CacheWrite5mTokens = snapshot.cache5m.value
		if snapshot.cache5m.value > 0 {
			result.Fields["cache_write_5m_tokens"] = Upstream
		}
	}
	if snapshot.cache1h.present {
		result.CacheWrite1hTokens = snapshot.cache1h.value
		if snapshot.cache1h.value > 0 {
			result.Fields["cache_write_1h_tokens"] = Upstream
		}
	}
	if snapshot.cacheCreation.present || snapshot.cache5m.present || snapshot.cache1h.present {
		result.CacheWriteTokens = snapshot.cacheCreation.value
		if cacheSplit > result.CacheWriteTokens {
			result.CacheWriteTokens = cacheSplit
		}
		if result.CacheWriteTokens > 0 {
			result.Fields["cache_write_tokens"] = Upstream
		}
	}

	if snapshot.webSearch.present && snapshot.webSearch.value > 0 {
		result.Calls = map[string]int64{"web_search": snapshot.webSearch.value}
		result.Fields["calls.web_search"] = Upstream
	}

	return result, nil
}

func anthropicTokenSum(values ...int64) (int64, error) {
	var total int64
	for _, value := range values {
		if value < 0 || value > math.MaxInt64-total {
			return 0, fmt.Errorf("Anthropic usage token total exceeds int64 range")
		}
		total += value
	}
	return total, nil
}

func (observer *anthropicObserver) observeSSEEvent(eventName string, data []byte) error {
	payload := bytes.TrimSpace(data)
	if bytes.Equal(payload, []byte("[DONE]")) {
		return nil
	}
	event, err := decodeStrictJSONObject(bytes.NewReader(payload))
	if err != nil {
		return ErrMalformedSSE
	}
	typeName, _ := event["type"].(string)
	if typeName == "" {
		typeName = eventName
	}

	switch typeName {
	case "message_start":
		if observer.sawStart || observer.sawStop {
			return malformedAnthropicEventOrder()
		}
		message, present, err := anthropicUsageObject(event, "message")
		if err != nil || !present {
			return ErrMalformedSSE
		}
		usage, _, err := anthropicUsageObject(message, "usage")
		if err != nil {
			return err
		}
		snapshot, err := parseAnthropicUsage(usage)
		if err != nil {
			return err
		}
		observer.usage = snapshot
		observer.sawStart = true
	case "message_delta":
		if !observer.anthropicMessageActive() {
			return malformedAnthropicEventOrder()
		}
		usage, present, err := anthropicUsageObject(event, "usage")
		if err != nil {
			return err
		}
		if !present {
			return nil
		}
		delta, err := parseAnthropicUsage(usage)
		if err != nil {
			return err
		}
		mergeAnthropicUsageDelta(&observer.usage, delta)
	case "message_stop":
		if !observer.anthropicMessageActive() {
			return malformedAnthropicEventOrder()
		}
		observer.sawStop = true
	case "content_block_start":
		if !observer.anthropicMessageActive() {
			return malformedAnthropicEventOrder()
		}
		contentBlock, ok := objectValue(event["content_block"])
		if !ok {
			return ErrMalformedSSE
		}
		if text, ok := contentBlock["text"].(string); ok {
			return observer.appendAnthropicFallback(text)
		}
	case "content_block_delta":
		if !observer.anthropicMessageActive() {
			return malformedAnthropicEventOrder()
		}
		delta, ok := objectValue(event["delta"])
		if !ok {
			return ErrMalformedSSE
		}
		for _, field := range []string{"text", "thinking", "partial_json"} {
			value, _ := delta[field].(string)
			if err := observer.appendAnthropicFallback(value); err != nil {
				return err
			}
		}
	case "content_block_stop":
		if !observer.anthropicMessageActive() {
			return malformedAnthropicEventOrder()
		}
	}
	return nil
}

func (observer *anthropicObserver) anthropicMessageActive() bool {
	return observer.sawStart && !observer.sawStop
}

func malformedAnthropicEventOrder() error {
	return fmt.Errorf("%w: %w", ErrMalformedSSE, ErrAnthropicEventOrder)
}

func mergeAnthropicUsageDelta(current *anthropicUsageSnapshot, delta anthropicUsageSnapshot) {
	merge := func(current *anthropicUsageValue, next anthropicUsageValue) {
		if next.present && next.value > 0 {
			*current = next
		}
	}
	merge(&current.input, delta.input)
	merge(&current.output, delta.output)
	merge(&current.cacheRead, delta.cacheRead)
	merge(&current.cacheCreation, delta.cacheCreation)
	merge(&current.cache5m, delta.cache5m)
	merge(&current.cache1h, delta.cache1h)
	merge(&current.webSearch, delta.webSearch)
}

func (observer *anthropicObserver) completeSSE(completion Completion) (Canonical, error) {
	result, err := normalizeAnthropicSnapshot(observer.usage, observer.estimate)
	if err != nil {
		return result, err
	}
	observer.applyAnthropicOutputFallback(&result)
	if terminal := incompleteCompletionTerminal(completion); terminal != "" {
		result.TerminalEvent = terminal
		return result, nil
	}
	if observer.observeErr != nil {
		if errors.Is(observer.observeErr, ErrObservationLimitExceeded) {
			result.TerminalEvent = "observation_limit_exceeded"
		} else {
			result.TerminalEvent = "malformed_sse"
		}
		return result, observer.observeErr
	}
	if !observer.sawStop {
		result.TerminalEvent = "eof_without_message_stop"
		return result, nil
	}
	result.Complete = true
	result.TerminalEvent = "message_stop"
	return result, nil
}

func (observer *anthropicObserver) appendAnthropicFallback(value string) error {
	if value == "" {
		return nil
	}
	size := int64(len(value))
	if size > observer.limits.MaxFallbackBytes-observer.fallbackBytes {
		return ErrObservationLimitExceeded
	}
	observer.fallbackBytes += size
	observer.localText.WriteString(value)
	return nil
}

func (observer *anthropicObserver) collectAnthropicJSONText(response map[string]any) error {
	for _, contentValue := range arrayValue(response["content"]) {
		content, ok := objectValue(contentValue)
		if !ok {
			continue
		}
		if text, ok := content["text"].(string); ok {
			if err := observer.appendAnthropicFallback(text); err != nil {
				return err
			}
		}
	}
	return nil
}

func (observer *anthropicObserver) applyAnthropicOutputFallback(result *Canonical) {
	if observer.usage.output.present {
		return
	}
	locallyCounted := countText(observer.localText.String(), observer.estimate.Model)
	if locallyCounted <= 0 {
		return
	}
	result.TextOutputTokens = locallyCounted
	result.Fields["text_output_tokens"] = LocallyCounted
}
