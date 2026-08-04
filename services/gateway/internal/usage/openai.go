package usage

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"github.com/shopspring/decimal"
)

type openAIObserver struct {
	protocol         string
	estimate         Estimate
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
	toolCount        int64
	mu               sync.Mutex
}

type responseStreamPart struct {
	text string
	done bool
}

func newOpenAIObserver(protocol string, contentType string, estimate Estimate) *openAIObserver {
	return &openAIObserver{protocol: protocol, estimate: estimate, stream: isSSEContentType(contentType), body: newResponseStore()}
}

func (observer *openAIObserver) Observe(chunk []byte) error {
	observer.mu.Lock()
	defer observer.mu.Unlock()

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

	if observer.stream {
		return observer.completeSSE(completion)
	}
	result := Canonical{Fields: make(map[string]Provenance)}
	body, openErr := observer.body.Open()
	if openErr != nil {
		return result, openErr
	}
	defer observer.body.Close()
	defer body.Close()
	decoder := json.NewDecoder(body)
	decoder.UseNumber()
	var response map[string]any
	if err := decoder.Decode(&response); err != nil || response == nil {
		if err == nil {
			err = fmt.Errorf("response must be a JSON object")
		}
		return result, fmt.Errorf("decode OpenAI response: %w", err)
	}

	usage, _ := objectValue(response["usage"])
	result, err := normalizeOpenAIUsage(usage, observer.protocol, observer.estimate)
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
	if completion.EOF && completion.Err == nil && !completion.ClientDisconnected && isSuccessStatus(completion.StatusCode) {
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
	for _, choiceValue := range arrayValue(response["choices"]) {
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
		if int64(len(calls)) > toolCount {
			toolCount = int64(len(calls))
		}
		for _, callValue := range calls {
			call, ok := objectValue(callValue)
			if !ok {
				continue
			}
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

	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.UseNumber()
	var event map[string]any
	if err := decoder.Decode(&event); err != nil || event == nil {
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
			observer.collectResponseString(event, "delta")
		case "response.function_call_arguments.delta":
			observer.collectResponseArguments(event, "delta", false)
		case "response.function_call_arguments.done":
			observer.collectResponseArguments(event, "arguments", true)
		case "response.completed":
			if response, ok := objectValue(event["response"]); ok {
				observer.response = response
				if usage, ok := objectValue(response["usage"]); ok {
					observer.usage = usage
				}
			}
			observer.terminal = "response.completed"
		}
	} else {
		observer.collectChatOutput(event)
	}
	return nil
}

func (observer *openAIObserver) collectResponseString(event map[string]any, field string) {
	if value, ok := event[field].(string); ok {
		observer.responseParts = append(observer.responseParts, responseStreamPart{text: value})
	}
}

func (observer *openAIObserver) collectResponseArguments(event map[string]any, field string, done bool) {
	value, ok := event[field].(string)
	if !ok {
		return
	}
	key := responseArgumentKey(event)
	if key == "" {
		observer.responseParts = append(observer.responseParts, responseStreamPart{text: value, done: done})
		return
	}
	if observer.responseArgParts == nil {
		observer.responseArgParts = make(map[string]int)
	}
	if index, exists := observer.responseArgParts[key]; exists {
		part := &observer.responseParts[index]
		if done {
			part.text = value
			part.done = true
		} else if !part.done {
			part.text += value
		}
		return
	}
	observer.responseArgParts[key] = len(observer.responseParts)
	observer.responseParts = append(observer.responseParts, responseStreamPart{text: value, done: done})
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

func (observer *openAIObserver) completeSSE(completion Completion) (Canonical, error) {
	result, err := normalizeOpenAIUsage(observer.usage, observer.protocol, observer.estimate)
	if err != nil {
		return result, err
	}
	if observer.protocol == "responses" {
		applyResponseImageCalls(&result, observer.response)
	}
	if result.TextOutputTokens == 0 {
		localText := observer.localText.String()
		if observer.protocol == "responses" {
			localText = observer.responseStreamText()
		}
		locallyCounted := countText(localText, observer.estimate.Model)
		if observer.protocol == "openai" {
			locallyCounted += observer.toolCount * 7
		}
		if locallyCounted > 0 {
			result.TextOutputTokens = locallyCounted
			result.Fields["text_output_tokens"] = LocallyCounted
		}
	}
	if observer.observeErr != nil {
		result.TerminalEvent = "malformed_sse"
		return result, observer.observeErr
	}
	if completion.ClientDisconnected {
		result.TerminalEvent = "client_disconnected"
		return result, nil
	}
	if completion.Err != nil {
		result.TerminalEvent = "relay_error"
		return result, nil
	}
	if observer.terminal == "" {
		if completion.EOF {
			result.TerminalEvent = "eof_without_terminal"
		}
		return result, nil
	}
	if observer.protocol == "responses" && observer.terminal != "response.completed" {
		result.TerminalEvent = observer.terminal
		return result, nil
	}
	if observer.terminal != "" && completion.Err == nil && !completion.ClientDisconnected && isSuccessStatus(completion.StatusCode) {
		result.Complete = true
		result.TerminalEvent = observer.terminal
	}
	return result, nil
}

func (observer *openAIObserver) collectChatOutput(event map[string]any) {
	for _, choiceValue := range arrayValue(event["choices"]) {
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
				observer.localText.WriteString(text)
			}
		}
		calls := arrayValue(delta["tool_calls"])
		if int64(len(calls)) > observer.toolCount {
			observer.toolCount = int64(len(calls))
		}
		for _, callValue := range calls {
			call, ok := objectValue(callValue)
			if !ok {
				continue
			}
			function, ok := objectValue(call["function"])
			if !ok {
				continue
			}
			if name, ok := function["name"].(string); ok {
				observer.localText.WriteString(name)
			}
			if arguments, ok := function["arguments"].(string); ok {
				observer.localText.WriteString(arguments)
			}
		}
	}
}

const maxSSEEventBytes = 1024 * 1024

// sseDecoder accepts arbitrary response chunks and dispatches only complete
// SSE events. Its explicit event bound avoids bufio.Scanner's silent 64 KiB
// limit while keeping pathological upstream frames bounded.
type sseDecoder struct {
	pending    []byte
	event      string
	data       bytes.Buffer
	eventBytes int
}

func (decoder *sseDecoder) Observe(chunk []byte, handle func(event string, data []byte) error) error {
	decoder.pending = append(decoder.pending, chunk...)

	for {
		lineEnd := bytes.IndexByte(decoder.pending, '\n')
		if lineEnd < 0 {
			if decoder.eventBytes+len(decoder.pending) > maxSSEEventBytes {
				decoder.reset()
				return ErrSSEEventTooLarge
			}
			return nil
		}
		rawLineBytes := lineEnd + 1
		if decoder.eventBytes+rawLineBytes > maxSSEEventBytes {
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
		if decoder.data.Len()+len(value)+1 > maxSSEEventBytes {
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
	categories = cache + image + audio
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
	categories = reasoning + image + audio
	return
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
