package usage

import (
	"bytes"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestEstimateOpenAIMessagesAndTools(t *testing.T) {
	body := []byte(`{
  "model":"gpt-4o",
  "messages":[
    {"role":"system","name":"policy","content":"You are helpful."},
    {"role":"user","content":[{"type":"text","text":"Hello"},{"type":"image_url","image_url":{"url":"data:image/png;base64,should-not-be-counted"}}]}
  ],
  "tools":[{"type":"function","function":{"name":"weather","description":"Returns weather.","parameters":{"type":"object","properties":{"city":{"type":"string"}}}}}],
  "max_tokens":50,
  "max_completion_tokens":60
}`)

	estimate, err := EstimateRequest(body, "", "openai")
	require.NoError(t, err)
	require.Equal(t, int64(60), estimate.MaxOutputTokens)
	require.Equal(t, "gpt-4o", estimate.Model)
	require.Equal(t, "openai", estimate.Protocol)

	text := "system\npolicy\nYou are helpful.\nuser\nHello\nweather\nReturns weather.\nmap[properties:map[city:map[type:string]] type:object]"
	want := countText(text, "gpt-4o") + 2*3 + 3 + 8 + 3
	require.Equal(t, want, estimate.PromptTokens)
}

func TestEstimateOpenAICompletionEmbeddingAndResponsesInputs(t *testing.T) {
	tests := []struct {
		name     string
		body     []byte
		wantText string
		wantMax  int64
		protocol string
		framing  int64
	}{
		{
			name:     "completion prompt array",
			body:     []byte(`{"model":"gpt-4o","prompt":["first prompt","second prompt"],"max_tokens":12}`),
			wantText: "first prompt\nsecond prompt",
			wantMax:  12,
			protocol: "openai",
			framing:  3,
		},
		{
			name:     "embedding input array",
			body:     []byte(`{"model":"gpt-4o","input":["first embedding","second embedding"]}`),
			wantText: "first embedding\nsecond embedding",
			protocol: "openai",
			framing:  3,
		},
		{
			name: "responses input and tools",
			body: []byte(`{
  "model":"gpt-4o",
  "input":[
    {"role":"user","content":[{"type":"input_text","text":"Question"},{"type":"input_image","image_url":"data:image/png;base64,should-not-be-counted"}]},
    {"role":"developer","content":"Use concise prose."}
  ],
  "instructions":"Follow policy.",
  "tools":[{"type":"function","name":"lookup","description":"Look up a record.","parameters":{"type":"object"}}],
  "max_output_tokens":42
}`),
			wantText: "Question\nUse concise prose.\n\"Follow policy.\"\n[{\"type\":\"function\",\"name\":\"lookup\",\"description\":\"Look up a record.\",\"parameters\":{\"type\":\"object\"}}]",
			wantMax:  42,
			protocol: "responses",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			estimate, err := EstimateRequest(tt.body, "", tt.protocol)
			require.NoError(t, err)
			require.Equal(t, tt.wantMax, estimate.MaxOutputTokens)
			want := countText(tt.wantText, "gpt-4o") + tt.framing
			require.Equal(t, want, estimate.PromptTokens)
		})
	}
}

func TestEstimateResponsesCountsRawConfigurationFields(t *testing.T) {
	body := []byte(`{"model":"gpt-4o","input":"Question","instructions":{"type":"text","text":"Stay focused"},"metadata":{"tenant":"alpha","trace":7},"text":{"format":{"type":"json_schema","name":"answer"}},"tool_choice":{"type":"function","name":"lookup"},"prompt":{"id":"pmpt_123","variables":{"city":"Paris"}},"tools":[{"type":"function","name":"lookup","description":"Look up a record."}],"max_output_tokens":17}`)
	bodyBefore := append([]byte(nil), body...)

	estimate, err := EstimateRequest(body, "", "responses")
	require.NoError(t, err)
	require.True(t, bytes.Equal(bodyBefore, body))
	require.Equal(t, int64(17), estimate.MaxOutputTokens)

	wantText := "Question\n{\"type\":\"text\",\"text\":\"Stay focused\"}\n{\"tenant\":\"alpha\",\"trace\":7}\n{\"format\":{\"type\":\"json_schema\",\"name\":\"answer\"}}\n{\"type\":\"function\",\"name\":\"lookup\"}\n{\"id\":\"pmpt_123\",\"variables\":{\"city\":\"Paris\"}}\n[{\"type\":\"function\",\"name\":\"lookup\",\"description\":\"Look up a record.\"}]"
	require.Equal(t, countText(wantText, "gpt-4o"), estimate.PromptTokens)
}

func TestEstimateResponsesPreservesRawConfigurationEncoding(t *testing.T) {
	body := []byte(`{"model":"gpt-4o","input":"Question","instructions":{"z" : "slash\/escape", "a" : "two  spaces"},"metadata":{"z" : "right", "a" : "left"},"text":{"format" : {"z" : "last", "a" : "first"}},"tool_choice":{"name" : "lookup", "type" : "function"},"prompt":{"id" : "pmpt_\/raw", "variables" : {"z" : "last", "a" : "first"}},"tools":[{"type" : "function", "name" : "lookup", "description" : "has  two spaces"}],"max_output_tokens":17}`)
	bodyBefore := append([]byte(nil), body...)

	estimate, err := EstimateRequest(body, "", "responses")
	require.NoError(t, err)
	require.True(t, bytes.Equal(bodyBefore, body))

	wantText := "Question\n" + `{"z" : "slash\/escape", "a" : "two  spaces"}` + "\n" +
		`{"z" : "right", "a" : "left"}` + "\n" +
		`{"format" : {"z" : "last", "a" : "first"}}` + "\n" +
		`{"name" : "lookup", "type" : "function"}` + "\n" +
		`{"id" : "pmpt_\/raw", "variables" : {"z" : "last", "a" : "first"}}` + "\n" +
		`[{"type" : "function", "name" : "lookup", "description" : "has  two spaces"}]`
	canonicalText := "Question\n" +
		`{"a":"two  spaces","z":"slash/escape"}` + "\n" +
		`{"a":"left","z":"right"}` + "\n" +
		`{"format":{"a":"first","z":"last"}}` + "\n" +
		`{"name":"lookup","type":"function"}` + "\n" +
		`{"id":"pmpt_/raw","variables":{"a":"first","z":"last"}}` + "\n" +
		`[{"description":"has  two spaces","name":"lookup","type":"function"}]`
	require.NotEqual(t, countText(canonicalText, "gpt-4o"), countText(wantText, "gpt-4o"))
	require.Equal(t, countText(wantText, "gpt-4o"), estimate.PromptTokens)
}

func TestEstimateGrokAndXAIUseOpenAICompatibleMessageShape(t *testing.T) {
	body := []byte(`{"model":"grok-3","messages":[{"role":"user","content":"Use the OpenAI message shape."}]}`)
	want := countText("user\nUse the OpenAI message shape.", "grok-3") + 3 + 3

	for _, protocol := range []string{"grok", "xai"} {
		t.Run(protocol, func(t *testing.T) {
			estimate, err := EstimateRequest(body, "", protocol)
			require.NoError(t, err)
			require.Equal(t, "openai", estimate.Protocol)
			require.Equal(t, want, estimate.PromptTokens)
		})
	}
}

func TestEstimateRequestRejectsUnknownAndAmbiguousProtocols(t *testing.T) {
	tests := []struct {
		name     string
		body     []byte
		protocol string
		wantErr  error
	}{
		{
			name:     "unknown explicit protocol",
			body:     []byte(`{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}`),
			protocol: "provider-that-is-not-supported",
			wantErr:  ErrUnsupportedProtocol,
		},
		{
			name:     "Claude message without system marker",
			body:     []byte(`{"model":"claude-3-7-sonnet","messages":[{"role":"user","content":"Hello"}]}`),
			protocol: "",
			wantErr:  ErrAmbiguousProtocol,
		},
		{
			name:     "Responses input without protocol marker",
			body:     []byte(`{"model":"gpt-4o","input":"Hello"}`),
			protocol: "",
			wantErr:  ErrAmbiguousProtocol,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := EstimateRequest(tt.body, "", tt.protocol)
			require.ErrorIs(t, err, tt.wantErr)
		})
	}
}

func TestEstimateRequestInfersOnlyUnambiguousProtocols(t *testing.T) {
	tests := []struct {
		name     string
		body     []byte
		protocol string
	}{
		{
			name:     "Gemini contents",
			body:     []byte(`{"model":"gemini-2.5-pro","contents":[{"parts":[{"text":"Hello"}]}]}`),
			protocol: "gemini",
		},
		{
			name:     "Claude system and messages",
			body:     []byte(`{"model":"claude-3-7-sonnet","system":"Be concise.","messages":[{"role":"user","content":"Hello"}]}`),
			protocol: "claude",
		},
		{
			name:     "Responses output limit",
			body:     []byte(`{"model":"gpt-4o","input":"Hello","max_output_tokens":10}`),
			protocol: "responses",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			estimate, err := EstimateRequest(tt.body, "", "")
			require.NoError(t, err)
			require.Equal(t, tt.protocol, estimate.Protocol)
		})
	}
}

func TestEstimateClaudeSystemMessagesAndTools(t *testing.T) {
	body := []byte(`{
  "model":"claude-3-7-sonnet",
  "system":[
    {"type":"text","text":"System rules."},
    {"type":"image","source":{"media_type":"image/png","data":"base64-should-not-be-counted"}}
  ],
  "messages":[{"role":"user","content":[
    {"type":"text","text":"你好"},
    {"type":"tool_use","name":"lookup","input":{"city":"Beijing"}},
    {"type":"image","source":{"media_type":"image/png","data":"base64-should-not-be-counted"}}
  ]}],
  "tools":[{"name":"weather","description":"Returns weather.","input_schema":{"type":"object","properties":{"city":{"type":"string"}}}}],
  "max_tokens":80
}`)

	estimate, err := EstimateRequest(body, "", "claude")
	require.NoError(t, err)
	require.Equal(t, int64(80), estimate.MaxOutputTokens)
	require.Equal(t, "claude", estimate.Protocol)

	text := "System rules.\nuser\n你好\nlookup\n{\"city\":\"Beijing\"}\nweather\nReturns weather.\n{\"properties\":{\"city\":{\"type\":\"string\"}},\"type\":\"object\"}"
	require.Equal(t, countText(text, "claude-3-7-sonnet"), estimate.PromptTokens)
}

func TestEstimateGeminiContentsAndTools(t *testing.T) {
	body := []byte(`{
  "model":"gemini-2.5-pro",
  "contents":[{"role":"user","parts":[
    {"text":"Gemini request"},
    {"inlineData":{"mimeType":"image/png","data":"base64-should-not-be-counted"}}
  ]}],
  "tools":[{"functionDeclarations":[{"name":"lookup","description":"Look up a record.","parameters":{"type":"object","properties":{"id":{"type":"string"}}}}]}],
  "generationConfig":{"maxOutputTokens":64}
}`)

	estimate, err := EstimateRequest(body, "", "gemini")
	require.NoError(t, err)
	require.Equal(t, int64(64), estimate.MaxOutputTokens)
	require.Equal(t, "gemini", estimate.Protocol)
	text := "Gemini request\nlookup\nLook up a record.\n{\"properties\":{\"id\":{\"type\":\"string\"}},\"type\":\"object\"}"
	require.Equal(t, countText(text, "gemini-2.5-pro"), estimate.PromptTokens)
}

func TestEstimateRequestMaxOutputPrecedenceAndValidation(t *testing.T) {
	tests := []struct {
		name     string
		body     []byte
		protocol string
		want     int64
		wantErr  bool
	}{
		{
			name:     "chat chooses the larger supported max",
			body:     []byte(`{"model":"gpt-4o","max_output_tokens":5,"max_completion_tokens":7,"max_tokens":9}`),
			protocol: "openai",
			want:     9,
		},
		{
			name:     "chat chooses max completion when larger",
			body:     []byte(`{"model":"gpt-4o","max_completion_tokens":10,"max_tokens":9}`),
			protocol: "openai",
			want:     10,
		},
		{
			name:     "responses uses max output only",
			body:     []byte(`{"model":"gpt-4o","max_output_tokens":5,"max_completion_tokens":7,"max_tokens":9}`),
			protocol: "responses",
			want:     5,
		},
		{
			name:     "max tokens fallback",
			body:     []byte(`{"model":"claude-3","max_tokens":9}`),
			protocol: "claude",
			want:     9,
		},
		{
			name:     "negative response max is rejected",
			body:     []byte(`{"model":"gpt-4o","max_output_tokens":-1}`),
			protocol: "responses",
			wantErr:  true,
		},
		{
			name:     "overflow response max is rejected",
			body:     []byte(`{"model":"gpt-4o","max_output_tokens":9223372036854775808}`),
			protocol: "responses",
			wantErr:  true,
		},
		{
			name:     "fraction response max is rejected",
			body:     []byte(`{"model":"gpt-4o","max_output_tokens":1.5}`),
			protocol: "responses",
			wantErr:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			estimate, err := EstimateRequest(tt.body, "", tt.protocol)
			if tt.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tt.want, estimate.MaxOutputTokens)
		})
	}
}

func TestEstimateRequestRejectsMalformedJSONAndPreservesBody(t *testing.T) {
	malformed := []byte(`{"model":"gpt-4o","messages":[`)
	malformedBefore := append([]byte(nil), malformed...)
	_, err := EstimateRequest(malformed, "", "openai")
	require.Error(t, err)
	require.True(t, bytes.Equal(malformedBefore, malformed))

	body := []byte(`{"model":"gpt-4o","messages":[{"role":"user","content":{"type":"text","text":"Count this only","image_url":"data:image/png;base64,should-not-be-counted"}}]}`)
	bodyBefore := append([]byte(nil), body...)
	estimate, err := EstimateRequest(body, "", "openai")
	require.NoError(t, err)
	require.True(t, bytes.Equal(bodyBefore, body))
	require.Equal(t, countText("user\nCount this only", "gpt-4o")+3+3, estimate.PromptTokens)
}
