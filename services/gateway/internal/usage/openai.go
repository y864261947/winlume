package usage

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"sync"

	"github.com/shopspring/decimal"
)

type openAIObserver struct {
	protocol         string
	estimate         Estimate
	limits           Limits
	stream           bool
	body             *responseStore
	sse              sseDecoder
	usage            map[string]any
	response         map[string]any
	terminal         string
	observeErr       error
	localText        strings.Builder
	responseParts    []responseStreamPart
	responseArgParts map[string]int
	chatTools        map[string]*chatToolCall
	chatToolAliases  map[string]string
	chatToolOrder    []string
	fallbackBytes    int64
	finalized        bool
	mu               sync.Mutex
}

type responseStreamPart struct {
	text string
	done bool
}

type chatToolCall struct {
	name              string
	arguments         string
	seenArgumentChunk map[string]struct{}
}

func newOpenAIObserver(protocol string, contentType string, estimate Estimate) *openAIObserver {
	return newOpenAIObserverWithLimits(protocol, contentType, estimate, DefaultLimits())
}

func newOpenAIObserverWithLimits(protocol string, contentType string, estimate Estimate, limits Limits) *openAIObserver {
	limits = normalizeLimits(limits)
	return &openAIObserver{
		protocol: protocol,
		estimate: estimate,
		limits:   limits,
		stream:   isSSEContentType(contentType),
		body:     newResponseStoreWithLimits(limits),
		sse:      sseDecoder{maxEventBytes: limits.MaxEventBytes},
	}
}

func (observer *openAIObserver) Observe(chunk []byte) error {
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

func (observer *openAIObserver) Complete(completion Completion) (Canonical, error) {
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
	result := Canonical{Fields: make(map[string]Provenance)}
	if terminal := incompleteCompletionTerminal(completion); terminal != "" {
		result, _ = normalizeOpenAIUsage(nil, observer.protocol, observer.estimate)
		result.TerminalEvent = terminal
		return result, nil
	}
	if err := observer.body.ObservationError(); err != nil {
		result.TerminalEvent = "observation_limit_exceeded"
		return result, err
	}
	body, openErr := observer.body.Open()
	if openErr != nil {
		return result, openErr
	}
	defer body.Close()
	response, err := decodeStrictJSONObject(body)
	if err != nil {
		return result, fmt.Errorf("decode OpenAI response: %w", err)
	}

	usage, _ := objectValue(response["usage"])
	result, err = normalizeOpenAIUsage(usage, observer.protocol, observer.estimate)
	if err != nil {
		return result, err
	}
	if observer.protocol == "responses" {
		applyResponseImageCalls(&result, response)
	}
	if result.TextOutputTokens == 0 && observer.protocol == "openai" {
		text, tools := collectChatResponseOutput(response)
		locallyCounted := countText(text, observer.estimate.Model) + tools*7
		if locallyCounted > 0 {
			result.TextOutputTokens = locallyCounted
			result.Fields["text_output_tokens"] = LocallyCounted
		}
	} else if result.TextOutputTokens == 0 && observer.protocol == "responses" {
		locallyCounted := countText(collectResponsesJSONOutput(response), observer.estimate.Model)
		if locallyCounted > 0 {
			result.TextOutputTokens = locallyCounted
			result.Fields["text_output_tokens"] = LocallyCounted
		}
	}
	if observer.protocol == "responses" {
		status, _ := response["status"].(string)
		if status == "completed" {
			result.Complete = true
			result.TerminalEvent = "response.completed"
		} else {
			result.TerminalEvent = responseJSONTerminal(status)
		}
	} else {
		result.Complete = true
		result.TerminalEvent = "json.eof"
	}
	return result, nil
}

func responseJSONTerminal(status string) string {
	status = strings.TrimSpace(status)
	if status == "" {
		return "response.incomplete"
	}
	return "response." + status
}

func collectChatResponseOutput(response map[string]any) (string, int64) {
	var text strings.Builder
	var toolCount int64
	seenTools := make(map[string]struct{})
	for choicePosition, choiceValue := range arrayValue(response["choices"]) {
		choice, ok := objectValue(choiceValue)
		if !ok {
			continue
		}
		if choiceText, ok := choice["text"].(string); ok {
			text.WriteString(choiceText)
		}
		message, ok := objectValue(choice["message"])
		if !ok {
			continue
		}
		appendResponseContent(&text, message["content"])
		for _, field := range []string{"reasoning_content", "reasoning"} {
			if value, ok := message[field].(string); ok {
				text.WriteString(value)
			}
		}
		calls := arrayValue(message["tool_calls"])
		for callPosition, callValue := range calls {
			call, ok := objectValue(callValue)
			if !ok {
				continue
			}
			aliases := chatToolAliases(choice, choicePosition, call, callPosition)
			if len(aliases) == 0 {
				continue
			}
			canonical := aliases[0]
			if _, exists := seenTools[canonical]; exists {
				continue
			}
			seenTools[canonical] = struct{}{}
			toolCount++
			function, ok := objectValue(call["function"])
			if !ok {
				continue
			}
			if name, ok := function["name"].(string); ok {
				text.WriteString(name)
			}
			if arguments, ok := function["arguments"].(string); ok {
				text.WriteString(arguments)
			}
		}
	}
	return text.String(), toolCount
}

func appendResponseContent(target *strings.Builder, value any) {
	switch typed := value.(type) {
	case string:
		target.WriteString(typed)
	case []any:
		for _, item := range typed {
			content, ok := objectValue(item)
			if !ok {
				continue
			}
			if text, ok := content["text"].(string); ok {
				target.WriteString(text)
			}
		}
	}
}

func collectResponsesJSONOutput(response map[string]any) string {
	var text strings.Builder
	for _, outputValue := range arrayValue(response["output"]) {
		output, ok := objectValue(outputValue)
		if !ok {
			continue
		}
		switch outputType, _ := output["type"].(string); outputType {
		case "message":
			for _, contentValue := range arrayValue(output["content"]) {
				content, ok := objectValue(contentValue)
				if !ok {
					continue
				}
				if contentType, _ := content["type"].(string); contentType == "output_text" {
					if value, ok := content["text"].(string); ok {
						text.WriteString(value)
					}
				}
			}
		case "function_call":
			if arguments, ok := output["arguments"].(string); ok {
				text.WriteString(arguments)
			}
		}
	}
	return text.String()
}

func (observer *openAIObserver) observeSSEEvent(eventName string, data []byte) error {
	payload := bytes.TrimSpace(data)
	if bytes.Equal(payload, []byte("[DONE]")) {
		if observer.protocol != "responses" || observer.terminal != "response.completed" {
			observer.terminal = "[DONE]"
		}
		return nil
	}

	event, err := decodeStrictJSONObject(bytes.NewReader(payload))
	if err != nil {
		return ErrMalformedSSE
	}
	if usage, ok := objectValue(event["usage"]); ok {
		observer.usage = usage
	}
	if observer.protocol == "responses" {
		typeName, _ := event["type"].(string)
		if typeName == "" {
			typeName = eventName
		}
		switch typeName {
		case "response.output_text.delta":
			if err := observer.collectResponseString(event, "delta"); err != nil {
				return err
			}
		case "response.function_call_arguments.delta":
			if err := observer.collectResponseArguments(event, "delta", false); err != nil {
				return err
			}
		case "response.function_call_arguments.done":
			if err := observer.collectResponseArguments(event, "arguments", true); err != nil {
				return err
			}
		case "response.completed", "response.incomplete", "response.failed":
			if response, ok := objectValue(event["response"]); ok {
				observer.response = response
				if usage, ok := objectValue(response["usage"]); ok {
					observer.usage = usage
				}
				observer.terminal = responseSSETerminal(typeName, response)
			} else {
				observer.terminal = typeName
			}
		}
	} else {
		if err := observer.collectChatOutput(event); err != nil {
			return err
		}
	}
	return nil
}

func responseSSETerminal(typeName string, response map[string]any) string {
	if typeName != "response.completed" {
		return typeName
	}
	status, _ := response["status"].(string)
	switch status {
	case "", "completed":
		return "response.completed"
	case "incomplete", "failed":
		return "response." + status
	default:
		return "response.incomplete"
	}
}

func (observer *openAIObserver) collectResponseString(event map[string]any, field string) error {
	if value, ok := event[field].(string); ok {
		return observer.appendResponsePart(value)
	}
	return nil
}

func (observer *openAIObserver) collectResponseArguments(event map[string]any, field string, done bool) error {
	value, ok := event[field].(string)
	if !ok {
		return nil
	}
	key := responseArgumentKey(event)
	if key == "" {
		return observer.appendResponsePart(value)
	}
	if observer.responseArgParts == nil {
		observer.responseArgParts = make(map[string]int)
	}
	if index, exists := observer.responseArgParts[key]; exists {
		part := &observer.responseParts[index]
		if done {
			if err := observer.replaceFallbackPart(part, value); err != nil {
				return err
			}
			part.done = true
		} else if !part.done {
			if err := observer.reserveFallbackBytes(int64(len(value))); err != nil {
				return err
			}
			part.text += value
		}
		return nil
	}
	if value == "" {
		return nil
	}
	if err := observer.reserveFallbackBytes(int64(len(value))); err != nil {
		return err
	}
	observer.responseArgParts[key] = len(observer.responseParts)
	observer.responseParts = append(observer.responseParts, responseStreamPart{text: value, done: done})
	return nil
}

func responseArgumentKey(event map[string]any) string {
	if itemID, ok := event["item_id"].(string); ok && itemID != "" {
		return "item_id:" + itemID
	}
	if outputIndex, present, err := nonNegativeInt64(event, "output_index"); err == nil && present {
		return fmt.Sprintf("output_index:%d", outputIndex)
	}
	return ""
}

func (observer *openAIObserver) responseStreamText() string {
	var text strings.Builder
	for _, part := range observer.responseParts {
		text.WriteString(part.text)
	}
	return text.String()
}

func (observer *openAIObserver) appendResponsePart(value string) error {
	if value == "" {
		return nil
	}
	if err := observer.reserveFallbackBytes(int64(len(value))); err != nil {
		return err
	}
	observer.responseParts = append(observer.responseParts, responseStreamPart{text: value})
	return nil
}

func (observer *openAIObserver) appendChatText(value string) error {
	if value == "" {
		return nil
	}
	if err := observer.reserveFallbackBytes(int64(len(value))); err != nil {
		return err
	}
	observer.localText.WriteString(value)
	return nil
}

func (observer *openAIObserver) replaceFallbackPart(part *responseStreamPart, value string) error {
	current := int64(len(part.text))
	next := int64(len(value))
	if next > current {
		if err := observer.reserveFallbackBytes(next - current); err != nil {
			return err
		}
	} else {
		observer.fallbackBytes -= current - next
	}
	part.text = value
	return nil
}

func (observer *openAIObserver) reserveFallbackBytes(size int64) error {
	if size <= 0 {
		return nil
	}
	if size > observer.limits.MaxFallbackBytes-observer.fallbackBytes {
		return ErrObservationLimitExceeded
	}
	observer.fallbackBytes += size
	return nil
}

func (observer *openAIObserver) completeSSE(completion Completion) (Canonical, error) {
	result, err := normalizeOpenAIUsage(observer.usage, observer.protocol, observer.estimate)
	if err != nil {
		return result, err
	}
	if observer.protocol == "responses" {
		applyResponseImageCalls(&result, observer.response)
	}
	if result.TextOutputTokens == 0 {
		localText := observer.chatStreamText()
		if observer.protocol == "responses" {
			localText = observer.responseStreamText()
		}
		locallyCounted := countText(localText, observer.estimate.Model)
		if observer.protocol == "openai" {
			locallyCounted += int64(len(observer.chatToolOrder)) * 7
		}
		if locallyCounted > 0 {
			result.TextOutputTokens = locallyCounted
			result.Fields["text_output_tokens"] = LocallyCounted
		}
	}
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
	if observer.terminal == "" {
		result.TerminalEvent = "eof_without_terminal"
		return result, nil
	}
	if observer.protocol == "responses" && observer.terminal != "response.completed" {
		result.TerminalEvent = observer.terminal
		return result, nil
	}
	if observer.terminal != "" {
		result.Complete = true
		result.TerminalEvent = observer.terminal
	}
	return result, nil
}

func (observer *openAIObserver) collectChatOutput(event map[string]any) error {
	for choicePosition, choiceValue := range arrayValue(event["choices"]) {
		choice, ok := objectValue(choiceValue)
		if !ok {
			continue
		}
		delta, ok := objectValue(choice["delta"])
		if !ok {
			continue
		}
		for _, field := range []string{"content", "reasoning_content", "reasoning"} {
			if text, ok := delta[field].(string); ok {
				if err := observer.appendChatText(text); err != nil {
					return err
				}
			}
		}
		calls := arrayValue(delta["tool_calls"])
		for callPosition, callValue := range calls {
			call, ok := objectValue(callValue)
			if !ok {
				continue
			}
			if err := observer.collectChatTool(choice, choicePosition, call, callPosition); err != nil {
				return err
			}
		}
	}
	return nil
}

func chatToolAliases(choice map[string]any, choicePosition int, call map[string]any, callPosition int) []string {
	choiceKey := fmt.Sprintf("choice_position:%d", choicePosition)
	if choiceIndex, present, err := nonNegativeInt64(choice, "index"); err == nil && present {
		choiceKey = fmt.Sprintf("choice_index:%d", choiceIndex)
	}
	aliases := make([]string, 0, 2)
	if callID, ok := call["id"].(string); ok && callID != "" {
		aliases = append(aliases, choiceKey+"|call_id:"+callID)
	}
	if callIndex, present, err := nonNegativeInt64(call, "index"); err == nil && present {
		aliases = append(aliases, fmt.Sprintf("%s|call_index:%d", choiceKey, callIndex))
	}
	if len(aliases) == 0 {
		aliases = append(aliases, fmt.Sprintf("%s|call_position:%d", choiceKey, callPosition))
	}
	return aliases
}

func (observer *openAIObserver) collectChatTool(choice map[string]any, choicePosition int, call map[string]any, callPosition int) error {
	aliases := chatToolAliases(choice, choicePosition, call, callPosition)
	canonical, callState, err := observer.chatToolForAliases(aliases)
	if err != nil {
		return err
	}
	_ = canonical
	function, ok := objectValue(call["function"])
	if !ok {
		return nil
	}
	if name, ok := function["name"].(string); ok && name != "" && callState.name == "" {
		if err := observer.reserveFallbackBytes(int64(len(name))); err != nil {
			return err
		}
		callState.name = name
	}
	if arguments, ok := function["arguments"].(string); ok && arguments != "" {
		if callState.seenArgumentChunk == nil {
			callState.seenArgumentChunk = make(map[string]struct{})
		}
		if _, seen := callState.seenArgumentChunk[arguments]; !seen {
			retainedBytes := int64(len(arguments)*2) + fallbackMapEntryBytes
			if err := observer.reserveFallbackBytes(retainedBytes); err != nil {
				return err
			}
			callState.seenArgumentChunk[arguments] = struct{}{}
			callState.arguments += arguments
		}
	}
	return nil
}

const fallbackMapEntryBytes int64 = 32

func (observer *openAIObserver) chatToolForAliases(aliases []string) (string, *chatToolCall, error) {
	if observer.chatToolAliases == nil {
		observer.chatToolAliases = make(map[string]string)
		observer.chatTools = make(map[string]*chatToolCall)
	}
	canonical := ""
	for _, alias := range aliases {
		if existing, ok := observer.chatToolAliases[alias]; ok {
			canonical = existing
			break
		}
	}
	if canonical == "" {
		canonical = aliases[0]
		if err := observer.reserveChatToolAliases(aliases); err != nil {
			return "", nil, err
		}
		callState := &chatToolCall{}
		observer.chatTools[canonical] = callState
		observer.chatToolOrder = append(observer.chatToolOrder, canonical)
		for _, alias := range aliases {
			observer.chatToolAliases[alias] = canonical
		}
		return canonical, callState, nil
	}
	newAliases := make([]string, 0, len(aliases))
	for _, alias := range aliases {
		if _, exists := observer.chatToolAliases[alias]; !exists {
			newAliases = append(newAliases, alias)
		}
	}
	if err := observer.reserveChatToolAliases(newAliases); err != nil {
		return "", nil, err
	}
	for _, alias := range newAliases {
		observer.chatToolAliases[alias] = canonical
	}
	return canonical, observer.chatTools[canonical], nil
}

func (observer *openAIObserver) reserveChatToolAliases(aliases []string) error {
	var size int64
	seen := make(map[string]struct{}, len(aliases))
	for _, alias := range aliases {
		if _, exists := seen[alias]; exists {
			continue
		}
		seen[alias] = struct{}{}
		size += int64(len(alias)) + fallbackMapEntryBytes
	}
	return observer.reserveFallbackBytes(size)
}

func (observer *openAIObserver) chatStreamText() string {
	var text strings.Builder
	text.WriteString(observer.localText.String())
	for _, canonical := range observer.chatToolOrder {
		callState := observer.chatTools[canonical]
		text.WriteString(callState.name)
		text.WriteString(callState.arguments)
	}
	return text.String()
}

const maxSSEEventBytes = 1024 * 1024

// sseDecoder accepts arbitrary response chunks and dispatches only complete
// SSE events. Its explicit event bound avoids bufio.Scanner's silent 64 KiB
// limit while keeping pathological upstream frames bounded.
type sseDecoder struct {
	pending       []byte
	event         string
	data          bytes.Buffer
	eventBytes    int64
	maxEventBytes int64
}

func (decoder *sseDecoder) eventLimit() int64 {
	if decoder.maxEventBytes <= 0 {
		return maxSSEEventBytes
	}
	return decoder.maxEventBytes
}

func (decoder *sseDecoder) Observe(chunk []byte, handle func(event string, data []byte) error) error {
	decoder.pending = append(decoder.pending, chunk...)

	for {
		lineEnd := bytes.IndexByte(decoder.pending, '\n')
		if lineEnd < 0 {
			if decoder.eventBytes+int64(len(decoder.pending)) > decoder.eventLimit() {
				decoder.reset()
				return ErrSSEEventTooLarge
			}
			return nil
		}
		rawLineBytes := int64(lineEnd + 1)
		if decoder.eventBytes+rawLineBytes > decoder.eventLimit() {
			decoder.reset()
			return ErrSSEEventTooLarge
		}
		line := decoder.pending[:lineEnd]
		decoder.pending = decoder.pending[lineEnd+1:]
		decoder.eventBytes += rawLineBytes
		if len(line) > 0 && line[len(line)-1] == '\r' {
			line = line[:len(line)-1]
		}
		if err := decoder.line(line, handle); err != nil {
			return err
		}
	}
}

func (decoder *sseDecoder) line(line []byte, handle func(event string, data []byte) error) error {
	if len(line) == 0 {
		if decoder.data.Len() == 0 {
			decoder.event = ""
			decoder.eventBytes = 0
			return nil
		}
		data := append([]byte(nil), decoder.data.Bytes()...)
		data = bytes.TrimSuffix(data, []byte("\n"))
		event := decoder.event
		decoder.event = ""
		decoder.data.Reset()
		decoder.eventBytes = 0
		return handle(event, data)
	}
	if line[0] == ':' {
		return nil
	}

	field, value, found := bytes.Cut(line, []byte(":"))
	if !found {
		value = nil
	}
	if len(value) > 0 && value[0] == ' ' {
		value = value[1:]
	}
	switch string(field) {
	case "event":
		decoder.event = string(value)
	case "data":
		if int64(decoder.data.Len()+len(value)+1) > decoder.eventLimit() {
			decoder.reset()
			return ErrSSEEventTooLarge
		}
		_, _ = decoder.data.Write(value)
		_ = decoder.data.WriteByte('\n')
	}
	return nil
}

func (decoder *sseDecoder) reset() {
	decoder.pending = nil
	decoder.event = ""
	decoder.data.Reset()
	decoder.eventBytes = 0
}

func normalizeOpenAIUsage(document map[string]any, protocol string, estimate Estimate) (Canonical, error) {
	result := Canonical{Fields: make(map[string]Provenance)}
	if document == nil {
		if estimate.PromptTokens > 0 {
			result.TextInputTokens = estimate.PromptTokens
			result.Fields["text_input_tokens"] = RequestEstimate
		}
		return result, nil
	}

	inputField, outputField := "prompt_tokens", "completion_tokens"
	inputDetailsField, outputDetailsField := "prompt_tokens_details", "completion_tokens_details"
	if protocol == "responses" {
		inputField, outputField = "input_tokens", "output_tokens"
		inputDetailsField, outputDetailsField = "input_tokens_details", "output_tokens_details"
	}

	input, hasInput, err := nonNegativeInt64(document, inputField)
	if err != nil {
		return result, err
	}
	output, hasOutput, err := nonNegativeInt64(document, outputField)
	if err != nil {
		return result, err
	}
	total, hasTotal, err := nonNegativeInt64(document, "total_tokens")
	if err != nil {
		return result, err
	}
	outputProvenance := Upstream
	if !hasOutput && hasInput && input > 0 && hasTotal && total >= input {
		output = total - input
		hasOutput = true
		outputProvenance = Derived
	}
	if hasInput {
		result.RawInputTokens = input
		result.Fields["raw_input_tokens"] = Upstream
	}

	inputDetails, _ := objectValue(document[inputDetailsField])
	outputDetails, _ := objectValue(document[outputDetailsField])
	cache, imageInput, audioInput, inputText, inputCategories, err := inputUsageDetails(inputDetails)
	if err != nil {
		return result, err
	}
	inputDetailTotal, err := checkedUsageSum("input detail tokens", inputText, inputCategories)
	if err != nil {
		return result, err
	}
	if hasInput && inputDetailTotal > input {
		return result, fmt.Errorf("OpenAI usage input detail tokens exceed %s", inputField)
	}
	if cache > 0 {
		result.CacheReadTokens = cache
		result.Fields["cache_read_tokens"] = Upstream
	}
	if imageInput > 0 {
		result.ImageInputTokens = imageInput
		result.Fields["image_input_tokens"] = Upstream
	}
	if audioInput > 0 {
		result.AudioInputTokens = audioInput
		result.Fields["audio_input_tokens"] = Upstream
	}
	if hasInput && input > 0 {
		result.TextInputTokens = input
		result.Fields["text_input_tokens"] = Upstream
		if inputText > 0 {
			result.TextInputTokens = inputText
		} else if inputCategories > 0 && input >= inputCategories && usageTotalIncludesInputCategories(hasInput, hasOutput, hasTotal, input, output, total) {
			result.TextInputTokens = input - inputCategories
			result.Fields["text_input_tokens"] = Derived
		}
	} else if estimate.PromptTokens > 0 {
		result.TextInputTokens = estimate.PromptTokens
		result.Fields["text_input_tokens"] = RequestEstimate
	}

	reasoning, imageOutput, audioOutput, outputText, outputCategories, err := outputUsageDetails(outputDetails)
	if err != nil {
		return result, err
	}
	outputDetailTotal, err := checkedUsageSum("output detail tokens", outputText, outputCategories)
	if err != nil {
		return result, err
	}
	if hasOutput && outputDetailTotal > output {
		return result, fmt.Errorf("OpenAI usage output detail tokens exceed %s", outputField)
	}
	if reasoning > 0 {
		result.ReasoningTokens = reasoning
		result.Fields["reasoning_tokens"] = Upstream
	}
	if imageOutput > 0 {
		result.ImageOutputTokens = imageOutput
		result.Fields["image_output_tokens"] = Upstream
	}
	if audioOutput > 0 {
		result.AudioOutputTokens = audioOutput
		result.Fields["audio_output_tokens"] = Upstream
	}
	if hasOutput && output > 0 {
		result.TextOutputTokens = output
		result.Fields["text_output_tokens"] = outputProvenance
		if outputText > 0 {
			result.TextOutputTokens = outputText
		} else if outputCategories > 0 && output >= outputCategories {
			result.TextOutputTokens = output - outputCategories
			result.Fields["text_output_tokens"] = Derived
		}
	}

	if cost, present, costErr := providerCost(document["cost"]); costErr != nil {
		return result, costErr
	} else if present {
		result.ProviderCostUSD = cost
		result.Fields["provider_cost_usd"] = ProviderCost
	}
	return result, nil
}

func usageTotalIncludesInputCategories(hasInput, hasOutput, hasTotal bool, input, output, total int64) bool {
	return hasInput && hasOutput && hasTotal && total >= input && total-input == output
}

func inputUsageDetails(document map[string]any) (cache, image, audio, text, categories int64, err error) {
	cache, _, err = nonNegativeInt64(document, "cached_tokens")
	if err != nil {
		return
	}
	image, _, err = nonNegativeInt64(document, "image_tokens")
	if err != nil {
		return
	}
	audio, _, err = nonNegativeInt64(document, "audio_tokens")
	if err != nil {
		return
	}
	text, _, err = nonNegativeInt64(document, "text_tokens")
	if err != nil {
		return
	}
	categories, err = checkedUsageSum("input detail categories", cache, image, audio)
	return
}

func outputUsageDetails(document map[string]any) (reasoning, image, audio, text, categories int64, err error) {
	reasoning, _, err = nonNegativeInt64(document, "reasoning_tokens")
	if err != nil {
		return
	}
	image, _, err = nonNegativeInt64(document, "image_tokens")
	if err != nil {
		return
	}
	audio, _, err = nonNegativeInt64(document, "audio_tokens")
	if err != nil {
		return
	}
	text, _, err = nonNegativeInt64(document, "text_tokens")
	if err != nil {
		return
	}
	categories, err = checkedUsageSum("output detail categories", reasoning, image, audio)
	return
}

func checkedUsageSum(name string, values ...int64) (int64, error) {
	var total int64
	for _, value := range values {
		if value < 0 {
			return 0, fmt.Errorf("OpenAI usage %s must be non-negative", name)
		}
		if value > math.MaxInt64-total {
			return 0, fmt.Errorf("OpenAI usage %s exceed int64 range", name)
		}
		total += value
	}
	return total, nil
}

func nonNegativeInt64(document map[string]any, name string) (int64, bool, error) {
	if document == nil {
		return 0, false, nil
	}
	value, present := document[name]
	if !present || value == nil {
		return 0, false, nil
	}
	number, ok := value.(json.Number)
	if !ok {
		return 0, true, fmt.Errorf("OpenAI usage field %s must be an integer", name)
	}
	parsed, err := number.Int64()
	if err != nil || parsed < 0 {
		return 0, true, fmt.Errorf("OpenAI usage field %s must be a non-negative integer", name)
	}
	return parsed, true, nil
}

func providerCost(value any) (decimal.Decimal, bool, error) {
	if value == nil {
		return decimal.Zero, false, nil
	}
	var source string
	switch typed := value.(type) {
	case json.Number:
		source = typed.String()
	case string:
		source = typed
	default:
		return decimal.Zero, true, fmt.Errorf("provider cost must be a decimal string or JSON number")
	}
	cost, err := decimal.NewFromString(source)
	if err != nil || cost.IsNegative() {
		return decimal.Zero, true, fmt.Errorf("provider cost must be a non-negative finite decimal")
	}
	return cost, true, nil
}
