package usage

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"sync"
)

var ErrAnthropicEventOrder = errors.New("invalid Anthropic SSE event order")

type anthropicObserver struct {
	estimate         Estimate
	limits           Limits
	stream           bool
	body             *responseStore
	sse              sseDecoder
	usage            anthropicUsageSnapshot
	sawStart         bool
	sawMessageDelta  bool
	sawStop          bool
	blocks           map[int64]*anthropicContentBlock
	blockOrder       []*anthropicContentBlock
	nextBlockIndex   int64
	activeBlockIndex int64
	hasActiveBlock   bool
	observeErr       error
	localText        strings.Builder
	fallbackBytes    int64
	finalized        bool
	mu               sync.Mutex
}

type anthropicContentBlock struct {
	kind            string
	name            string
	initialInput    string
	hasInitialInput bool
	text            strings.Builder
	thinking        strings.Builder
	partialJSON     strings.Builder
	hasPartialJSON  bool
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
	usage, _, err := anthropicUsageObject(response, "usage")
	if err != nil {
		return Canonical{Fields: make(map[string]Provenance)}, err
	}
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
	}
	observer.applyAnthropicOutputFallback(&result, snapshot.output.present, observer.localText.String())
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
		observer.blocks = make(map[int64]*anthropicContentBlock)
		observer.blockOrder = nil
		observer.nextBlockIndex = 0
		observer.activeBlockIndex = 0
		observer.hasActiveBlock = false
	case "message_delta":
		if !observer.anthropicMessageActive() || observer.hasActiveBlock {
			return malformedAnthropicEventOrder()
		}
		observer.sawMessageDelta = true
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
		if !observer.anthropicMessageActive() || !observer.sawMessageDelta || observer.hasActiveBlock {
			return malformedAnthropicEventOrder()
		}
		observer.sawStop = true
	case "content_block_start":
		if !observer.anthropicMessageActive() || observer.sawMessageDelta {
			return malformedAnthropicEventOrder()
		}
		index, err := anthropicContentBlockIndex(event)
		if err != nil {
			return err
		}
		if observer.hasActiveBlock || index != observer.nextBlockIndex {
			return malformedAnthropicEventOrder()
		}
		if _, exists := observer.blocks[index]; exists {
			return malformedAnthropicEventOrder()
		}
		contentBlock, ok := objectValue(event["content_block"])
		if !ok {
			return ErrMalformedSSE
		}
		block, reservation, err := anthropicContentBlockFromStart(contentBlock)
		if err != nil {
			return err
		}
		if err := observer.reserveAnthropicFallbackBytes(reservation); err != nil {
			return err
		}
		observer.blocks[index] = block
		observer.blockOrder = append(observer.blockOrder, block)
		observer.activeBlockIndex = index
		observer.hasActiveBlock = true
	case "content_block_delta":
		if !observer.anthropicMessageActive() || observer.sawMessageDelta {
			return malformedAnthropicEventOrder()
		}
		index, err := anthropicContentBlockIndex(event)
		if err != nil {
			return err
		}
		block, exists := observer.blocks[index]
		if !observer.hasActiveBlock || index != observer.activeBlockIndex || !exists {
			return malformedAnthropicEventOrder()
		}
		delta, ok := objectValue(event["delta"])
		if !ok {
			return ErrMalformedSSE
		}
		if err := observer.appendAnthropicBlockDelta(block, delta); err != nil {
			return err
		}
	case "content_block_stop":
		if !observer.anthropicMessageActive() || observer.sawMessageDelta {
			return malformedAnthropicEventOrder()
		}
		index, err := anthropicContentBlockIndex(event)
		if err != nil {
			return err
		}
		_, exists := observer.blocks[index]
		if !observer.hasActiveBlock || index != observer.activeBlockIndex || !exists {
			return malformedAnthropicEventOrder()
		}
		observer.hasActiveBlock = false
		observer.nextBlockIndex++
	}
	return nil
}

func (observer *anthropicObserver) anthropicMessageActive() bool {
	return observer.sawStart && !observer.sawStop
}

func malformedAnthropicEventOrder() error {
	return fmt.Errorf("%w: %w", ErrMalformedSSE, ErrAnthropicEventOrder)
}

func anthropicContentBlockIndex(event map[string]any) (int64, error) {
	index, present, err := nonNegativeInt64(event, "index")
	if err != nil || !present {
		return 0, ErrMalformedSSE
	}
	return index, nil
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
	observer.applyAnthropicOutputFallback(&result, observer.usage.output.present, observer.anthropicStreamFallbackText())
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
	if err := observer.reserveAnthropicFallbackBytes(int64(len(value))); err != nil {
		return err
	}
	observer.localText.WriteString(value)
	return nil
}

const (
	anthropicBlockEntryBytes      int64 = 64
	anthropicBlockMapEntryBytes   int64 = 64
	anthropicBlockOrderEntryBytes int64 = 8
)

func anthropicContentBlockFromStart(contentBlock map[string]any) (*anthropicContentBlock, int64, error) {
	block := &anthropicContentBlock{}
	block.kind, _ = contentBlock["type"].(string)
	block.name, _ = contentBlock["name"].(string)
	if input, present := contentBlock["input"]; present {
		serialized, err := json.Marshal(input)
		if err != nil {
			return nil, 0, fmt.Errorf("encode Anthropic tool input: %w", err)
		}
		block.initialInput = string(serialized)
		block.hasInitialInput = true
	}
	text, _ := contentBlock["text"].(string)
	thinking, _ := contentBlock["thinking"].(string)
	reservation, err := checkedFallbackBytes(
		anthropicBlockEntryBytes,
		anthropicBlockMapEntryBytes,
		anthropicBlockOrderEntryBytes,
		int64(len(block.kind)),
		int64(len(block.name)),
		int64(len(block.initialInput)),
		int64(len(text)),
		int64(len(thinking)),
	)
	if err != nil {
		return nil, 0, err
	}
	block.text.WriteString(text)
	block.thinking.WriteString(thinking)
	return block, reservation, nil
}

func (observer *anthropicObserver) appendAnthropicBlockDelta(block *anthropicContentBlock, delta map[string]any) error {
	text, _ := delta["text"].(string)
	thinking, _ := delta["thinking"].(string)
	partialJSON, hasPartialJSON := delta["partial_json"].(string)
	reservation, err := checkedFallbackBytes(int64(len(text)), int64(len(thinking)), int64(len(partialJSON)))
	if err != nil {
		return err
	}
	if err := observer.reserveAnthropicFallbackBytes(reservation); err != nil {
		return err
	}
	block.text.WriteString(text)
	block.thinking.WriteString(thinking)
	if hasPartialJSON {
		block.partialJSON.WriteString(partialJSON)
		block.hasPartialJSON = true
	}
	return nil
}

func (observer *anthropicObserver) reserveAnthropicFallbackBytes(size int64) error {
	if size == 0 {
		return nil
	}
	if size < 0 || observer.fallbackBytes < 0 || observer.fallbackBytes > observer.limits.MaxFallbackBytes {
		return ErrObservationLimitExceeded
	}
	if size > observer.limits.MaxFallbackBytes-observer.fallbackBytes {
		return ErrObservationLimitExceeded
	}
	observer.fallbackBytes += size
	return nil
}

func (observer *anthropicObserver) collectAnthropicJSONText(response map[string]any) error {
	for _, contentValue := range arrayValue(response["content"]) {
		content, ok := objectValue(contentValue)
		if !ok {
			continue
		}
		switch content["type"] {
		case "text":
			text, _ := content["text"].(string)
			if err := observer.appendAnthropicFallback(text); err != nil {
				return err
			}
		case "thinking":
			thinking, _ := content["thinking"].(string)
			if err := observer.appendAnthropicFallback(thinking); err != nil {
				return err
			}
		case "tool_use":
			name, _ := content["name"].(string)
			if err := observer.appendAnthropicFallback(name); err != nil {
				return err
			}
			if input, present := content["input"]; present {
				serialized, err := json.Marshal(input)
				if err != nil {
					return fmt.Errorf("encode Anthropic tool input: %w", err)
				}
				if err := observer.appendAnthropicFallback(string(serialized)); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func (observer *anthropicObserver) anthropicStreamFallbackText() string {
	var text strings.Builder
	for _, block := range observer.blockOrder {
		if block.kind == "tool_use" {
			text.WriteString(block.name)
			if block.hasPartialJSON {
				text.WriteString(block.partialJSON.String())
			} else if block.hasInitialInput {
				text.WriteString(block.initialInput)
			}
			continue
		}
		text.WriteString(block.text.String())
		text.WriteString(block.thinking.String())
	}
	return text.String()
}

func (observer *anthropicObserver) applyAnthropicOutputFallback(result *Canonical, outputPresent bool, text string) {
	if outputPresent {
		return
	}
	locallyCounted := countText(text, observer.estimate.Model)
	if locallyCounted <= 0 {
		return
	}
	result.TextOutputTokens = locallyCounted
	result.Fields["text_output_tokens"] = LocallyCounted
}
