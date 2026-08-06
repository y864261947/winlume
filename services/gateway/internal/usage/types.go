// Package usage contains protocol-neutral usage primitives and local request
// estimation. Provider response normalization belongs in later normalizers.
package usage

import "github.com/shopspring/decimal"

// Provenance identifies how a canonical usage field was obtained.
type Provenance string

const (
	Upstream        Provenance = "upstream"
	LocallyCounted  Provenance = "locally_counted"
	RequestEstimate Provenance = "request_estimate"
	ProviderCost    Provenance = "provider_cost"
	Derived         Provenance = "derived"
)

// Canonical is the provider-neutral usage representation used by pricing and
// billing. RawInputTokens is retained for auditability when a protocol's
// reported input total includes cache or media subcategories.
type Canonical struct {
	RawInputTokens       int64                 `json:"raw_input_tokens"`
	TextInputTokens      int64                 `json:"text_input_tokens"`
	TextOutputTokens     int64                 `json:"text_output_tokens"`
	ReasoningTokens      int64                 `json:"reasoning_tokens"`
	CacheReadTokens      int64                 `json:"cache_read_tokens"`
	CacheWriteTokens     int64                 `json:"cache_write_tokens"`
	CacheWrite5mTokens   int64                 `json:"cache_write_5m_tokens"`
	CacheWrite1hTokens   int64                 `json:"cache_write_1h_tokens"`
	ImageInputTokens     int64                 `json:"image_input_tokens"`
	ImageOutputTokens    int64                 `json:"image_output_tokens"`
	AudioInputTokens     int64                 `json:"audio_input_tokens"`
	AudioOutputTokens    int64                 `json:"audio_output_tokens"`
	Calls                map[string]int64      `json:"calls"`
	DurationMilliseconds int64                 `json:"duration_milliseconds"`
	ProviderCostUSD      decimal.Decimal       `json:"provider_cost_usd"`
	Fields               map[string]Provenance `json:"fields"`
	Complete             bool                  `json:"complete"`
	TerminalEvent        string                `json:"terminal_event"`
}

// Estimate is the request-side reservation estimate. It is distinct from
// normalized provider usage and is never presented as upstream-reported data.
type Estimate struct {
	PromptTokens    int64  `json:"prompt_tokens"`
	MaxOutputTokens int64  `json:"max_output_tokens"`
	Model           string `json:"model"`
	Protocol        string `json:"protocol"`
}
