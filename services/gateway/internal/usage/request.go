package usage

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"strings"
)

var (
	ErrMalformedRequest  = errors.New("usage request must be a JSON object")
	ErrInvalidMaxTokens  = errors.New("requested max output tokens must be a non-negative int64")
	ErrPromptTokenBounds = errors.New("estimated prompt tokens exceed int64")
)

// EstimateRequest reads a relay body without changing it and produces a local
// prompt/output reservation estimate. model overrides a body model when set.
// protocol accepts openai, responses (or openai_responses), claude, and gemini.
func EstimateRequest(body []byte, model, protocol string) (Estimate, error) {
	document, err := decodeRequest(body)
	if err != nil {
		return Estimate{}, err
	}

	resolvedProtocol := normalizeProtocol(protocol)
	if resolvedProtocol == "" {
		resolvedProtocol = inferProtocol(document)
	}
	resolvedModel := model
	if strings.TrimSpace(resolvedModel) == "" {
		resolvedModel, _ = document["model"].(string)
	}

	var texts []string
	var messageCount, nameCount, toolCount int64
	switch resolvedProtocol {
	case "openai":
		texts, messageCount, nameCount, toolCount = collectOpenAIChat(document)
	case "responses":
		texts = collectResponses(document)
	case "claude":
		texts = collectClaude(document)
	case "gemini":
		texts = collectGemini(document)
	default:
		texts = collectGeneric(document)
	}

	maxOutputTokens, err := requestedMaxTokens(document, resolvedProtocol)
	if err != nil {
		return Estimate{}, err
	}

	promptTokens := countText(strings.Join(texts, "\n"), resolvedModel)
	if resolvedProtocol == "openai" {
		// This is intentionally limited to Chat/Completions protocol. Responses
		// has its own wire format and new-api does not apply this framing there.
		promptTokens, err = addTokenCounts(promptTokens, messageCount*3, nameCount*3, toolCount*8, 3)
		if err != nil {
			return Estimate{}, err
		}
	}

	return Estimate{
		PromptTokens:    promptTokens,
		MaxOutputTokens: maxOutputTokens,
		Model:           resolvedModel,
		Protocol:        resolvedProtocol,
	}, nil
}

func decodeRequest(body []byte) (map[string]any, error) {
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	var document map[string]any
	if err := decoder.Decode(&document); err != nil || document == nil {
		return nil, fmt.Errorf("%w: %v", ErrMalformedRequest, err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		if err == nil {
			return nil, fmt.Errorf("%w: trailing JSON value", ErrMalformedRequest)
		}
		return nil, fmt.Errorf("%w: %v", ErrMalformedRequest, err)
	}
	return document, nil
}

func normalizeProtocol(protocol string) string {
	switch strings.ToLower(strings.TrimSpace(protocol)) {
	case "openai", "openai_chat", "chat_completions", "completions", "embeddings":
		return "openai"
	case "responses", "openai_responses", "openai-responses":
		return "responses"
	case "claude", "anthropic":
		return "claude"
	case "gemini", "google", "google_gemini":
		return "gemini"
	default:
		return strings.ToLower(strings.TrimSpace(protocol))
	}
}

func inferProtocol(document map[string]any) string {
	if _, ok := document["contents"]; ok {
		return "gemini"
	}
	if _, ok := document["system"]; ok {
		if _, messages := document["messages"]; messages {
			return "claude"
		}
	}
	if _, hasInput := document["input"]; hasInput {
		if _, responses := document["max_output_tokens"]; responses {
			return "responses"
		}
		if _, responses := document["instructions"]; responses {
			return "responses"
		}
	}
	return "openai"
}

func requestedMaxTokens(document map[string]any, protocol string) (int64, error) {
	switch protocol {
	case "responses":
		return int64Field(document, "max_output_tokens")
	case "gemini":
		if generation, ok := objectValue(document["generationConfig"]); ok {
			return firstInt64Field(generation, "maxOutputTokens", "max_output_tokens")
		}
		return firstInt64Field(document, "maxOutputTokens", "max_output_tokens")
	case "claude":
		return int64Field(document, "max_tokens")
	default:
		maxTokens, err := int64Field(document, "max_tokens")
		if err != nil {
			return 0, err
		}
		maxCompletion, err := int64Field(document, "max_completion_tokens")
		if err != nil {
			return 0, err
		}
		if maxCompletion > maxTokens {
			return maxCompletion, nil
		}
		return maxTokens, nil
	}
}

func firstInt64Field(document map[string]any, fields ...string) (int64, error) {
	for _, field := range fields {
		if _, present := document[field]; present {
			return int64Field(document, field)
		}
	}
	return 0, nil
}

func int64Field(document map[string]any, field string) (int64, error) {
	value, present := document[field]
	if !present || value == nil {
		return 0, nil
	}
	number, ok := value.(json.Number)
	if !ok {
		return 0, fmt.Errorf("%w: %s", ErrInvalidMaxTokens, field)
	}
	parsed, err := number.Int64()
	if err != nil || parsed < 0 {
		return 0, fmt.Errorf("%w: %s", ErrInvalidMaxTokens, field)
	}
	return parsed, nil
}

func collectOpenAIChat(document map[string]any) ([]string, int64, int64, int64) {
	texts := appendTextValue(nil, document["prompt"])
	texts = append(texts, appendTextValue(nil, document["input"])...)

	var messages, names, tools int64
	for _, messageValue := range arrayValue(document["messages"]) {
		message, ok := objectValue(messageValue)
		if !ok {
			continue
		}
		messages++
		if role, ok := message["role"].(string); ok {
			texts = append(texts, role)
		}
		content, hasContent := message["content"]
		if hasContent {
			if name, ok := message["name"].(string); ok {
				names++
				texts = append(texts, name)
			}
			texts = append(texts, appendContentText(nil, content)...)
		}
	}

	for _, toolValue := range arrayValue(document["tools"]) {
		tool, ok := objectValue(toolValue)
		if !ok {
			continue
		}
		tools++
		definition := tool
		if function, ok := objectValue(tool["function"]); ok {
			definition = function
		}
		if name, ok := definition["name"].(string); ok {
			texts = append(texts, name)
		}
		if description, ok := definition["description"].(string); ok && description != "" {
			texts = append(texts, description)
		}
		if parameters, ok := definition["parameters"]; ok && parameters != nil {
			// new-api uses fmt.Sprintf("%v", parameters) after JSON decoding.
			texts = append(texts, fmt.Sprint(parameters))
		}
	}
	return texts, messages, names, tools
}

func collectResponses(document map[string]any) []string {
	texts := appendResponsesInput(nil, document["input"])
	if instructions, ok := document["instructions"]; ok {
		texts = append(texts, appendContentText(nil, instructions)...)
	}
	if tools, ok := document["tools"]; ok && tools != nil {
		if encoded, err := json.Marshal(tools); err == nil {
			// Responses accepts several tool shapes; keeping canonical structured
			// JSON avoids dropping function schemas or MCP configuration.
			texts = append(texts, string(encoded))
		}
	}
	return texts
}

func appendResponsesInput(texts []string, value any) []string {
	switch typed := value.(type) {
	case string:
		return append(texts, typed)
	case []any:
		for _, item := range typed {
			texts = appendResponsesInput(texts, item)
		}
		return texts
	case map[string]any:
		if content, ok := typed["content"]; ok {
			return appendContentText(texts, content)
		}
		return appendContentText(texts, typed)
	default:
		return texts
	}
}

func collectClaude(document map[string]any) []string {
	texts := appendContentText(nil, document["system"])
	for _, messageValue := range arrayValue(document["messages"]) {
		message, ok := objectValue(messageValue)
		if !ok {
			continue
		}
		if role, ok := message["role"].(string); ok {
			texts = append(texts, role)
		}
		texts = appendClaudeContent(texts, message["content"])
	}
	for _, toolValue := range arrayValue(document["tools"]) {
		tool, ok := objectValue(toolValue)
		if !ok {
			continue
		}
		if name, ok := tool["name"].(string); ok && name != "" {
			texts = append(texts, name)
		}
		if description, ok := tool["description"].(string); ok && description != "" {
			texts = append(texts, description)
		}
		for _, field := range []string{"input_schema", "user_location"} {
			if value, ok := tool[field]; ok && value != nil {
				if encoded, err := json.Marshal(value); err == nil {
					texts = append(texts, string(encoded))
				}
			}
		}
	}
	return texts
}

func appendClaudeContent(texts []string, value any) []string {
	switch typed := value.(type) {
	case string:
		return append(texts, typed)
	case []any:
		for _, item := range typed {
			content, ok := objectValue(item)
			if !ok {
				continue
			}
			typeName, _ := content["type"].(string)
			switch typeName {
			case "text":
				if text, ok := content["text"].(string); ok {
					texts = append(texts, text)
				}
			case "tool_use":
				if name, ok := content["name"].(string); ok && name != "" {
					texts = append(texts, name)
				}
				if input, ok := content["input"]; ok && input != nil {
					if encoded, err := json.Marshal(input); err == nil {
						texts = append(texts, string(encoded))
					}
				}
			case "tool_result":
				if result, ok := content["content"]; ok && result != nil {
					if encoded, err := json.Marshal(result); err == nil {
						texts = append(texts, string(encoded))
					}
				}
			case "image", "document":
				continue
			default:
				texts = append(texts, appendContentText(nil, content)...)
			}
		}
	}
	return texts
}

func collectGemini(document map[string]any) []string {
	var texts []string
	for _, contentValue := range arrayValue(document["contents"]) {
		content, ok := objectValue(contentValue)
		if !ok {
			continue
		}
		for _, partValue := range arrayValue(content["parts"]) {
			part, ok := objectValue(partValue)
			if !ok {
				continue
			}
			if text, ok := part["text"].(string); ok {
				texts = append(texts, text)
			}
		}
	}
	for _, toolValue := range arrayValue(document["tools"]) {
		tool, ok := objectValue(toolValue)
		if !ok {
			continue
		}
		declarations := arrayValue(tool["functionDeclarations"])
		if len(declarations) == 0 {
			declarations = arrayValue(tool["function_declarations"])
		}
		for _, declarationValue := range declarations {
			declaration, ok := objectValue(declarationValue)
			if !ok {
				continue
			}
			if name, ok := declaration["name"].(string); ok && name != "" {
				texts = append(texts, name)
			}
			if description, ok := declaration["description"].(string); ok && description != "" {
				texts = append(texts, description)
			}
			if parameters, ok := declaration["parameters"]; ok && parameters != nil {
				if encoded, err := json.Marshal(parameters); err == nil {
					texts = append(texts, string(encoded))
				}
			}
		}
	}
	return texts
}

func collectGeneric(document map[string]any) []string {
	var texts []string
	for _, field := range []string{"prompt", "input", "system", "messages", "contents"} {
		texts = append(texts, appendContentText(nil, document[field])...)
	}
	return texts
}

func appendTextValue(texts []string, value any) []string {
	switch typed := value.(type) {
	case string:
		return append(texts, typed)
	case []any:
		for _, item := range typed {
			texts = append(texts, appendTextValue(nil, item)...)
		}
	case map[string]any:
		texts = append(texts, appendContentText(nil, typed)...)
	}
	return texts
}

func appendContentText(texts []string, value any) []string {
	switch typed := value.(type) {
	case string:
		return append(texts, typed)
	case []any:
		for _, item := range typed {
			texts = appendContentText(texts, item)
		}
	case map[string]any:
		typeName, _ := typed["type"].(string)
		switch typeName {
		case "image", "image_url", "input_image", "input_audio", "audio", "video", "file", "input_file", "document":
			return texts
		}
		if text, ok := typed["text"].(string); ok {
			texts = append(texts, text)
		}
	}
	return texts
}

func arrayValue(value any) []any {
	array, _ := value.([]any)
	return array
}

func objectValue(value any) (map[string]any, bool) {
	object, ok := value.(map[string]any)
	return object, ok
}

func addTokenCounts(values ...int64) (int64, error) {
	var total int64
	for _, value := range values {
		if value > 0 && total > math.MaxInt64-value {
			return 0, ErrPromptTokenBounds
		}
		total += value
	}
	return total, nil
}
