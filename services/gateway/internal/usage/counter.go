package usage

import (
	"math"
	"strings"
	"sync"
	"unicode"

	"github.com/tiktoken-go/tokenizer"
	"github.com/tiktoken-go/tokenizer/codec"
)

type estimatorFamily string

const (
	estimatorOpenAI estimatorFamily = "openai"
	estimatorClaude estimatorFamily = "claude"
	estimatorGemini estimatorFamily = "gemini"
)

type tokenMultipliers struct {
	word       float64
	number     float64
	cjk        float64
	symbol     float64
	mathSymbol float64
	urlDelim   float64
	atSign     float64
	emoji      float64
	newline    float64
	space      float64
	basePad    int64
}

var familyMultipliers = map[estimatorFamily]tokenMultipliers{
	estimatorGemini: {
		word: 1.15, number: 2.8, cjk: 0.68, symbol: 0.38, mathSymbol: 1.05,
		urlDelim: 1.2, atSign: 2.5, emoji: 1.08, newline: 1.15, space: 0.2,
	},
	estimatorClaude: {
		word: 1.13, number: 1.63, cjk: 1.21, symbol: 0.4, mathSymbol: 4.52,
		urlDelim: 1.26, atSign: 2.82, emoji: 2.6, newline: 0.89, space: 0.39,
	},
	estimatorOpenAI: {
		word: 1.02, number: 1.55, cjk: 0.85, symbol: 0.4, mathSymbol: 2.68,
		urlDelim: 1.0, atSign: 2.0, emoji: 2.12, newline: 0.5, space: 0.42,
	},
}

var (
	defaultTokenCodec = codec.NewCl100kBase()
	tokenCodecCache   = make(map[string]tokenizer.Codec)
	tokenCodecMu      sync.RWMutex
)

// countText follows new-api's model split: only its OpenAI text-model set uses
// tiktoken. Claude, Gemini, Grok, and unknown models use family estimation.
func countText(text, model string) int64 {
	if text == "" {
		return 0
	}
	if isOpenAITextModel(model) {
		count, err := codecForModel(model).Count(text)
		if err == nil {
			return int64(count)
		}
		fallbackCount, fallbackErr := defaultTokenCodec.Count(text)
		if fallbackErr == nil {
			return int64(fallbackCount)
		}
		return 0
	}
	return weightedTokenEstimate(text, familyForModel(model))
}

func isOpenAITextModel(model string) bool {
	model = strings.ToLower(model)
	for _, fragment := range []string{"gpt-", "o1", "o3", "o4", "chatgpt"} {
		if strings.Contains(model, fragment) {
			return true
		}
	}
	return false
}

func codecForModel(model string) tokenizer.Codec {
	key := strings.ToLower(strings.TrimSpace(model))
	tokenCodecMu.RLock()
	if cached, ok := tokenCodecCache[key]; ok {
		tokenCodecMu.RUnlock()
		return cached
	}
	tokenCodecMu.RUnlock()

	tokenCodecMu.Lock()
	defer tokenCodecMu.Unlock()
	if cached, ok := tokenCodecCache[key]; ok {
		return cached
	}

	modelCodec, err := tokenizer.ForModel(tokenizer.Model(key))
	if err != nil {
		modelCodec = defaultTokenCodec
	}
	tokenCodecCache[key] = modelCodec
	return modelCodec
}

func familyForModel(model string) estimatorFamily {
	model = strings.ToLower(model)
	switch {
	case strings.Contains(model, "gemini"):
		return estimatorGemini
	case strings.Contains(model, "claude"):
		return estimatorClaude
	default:
		// Grok and unknown models deliberately use new-api's OpenAI multiplier
		// fallback, without entering the tiktoken branch above.
		return estimatorOpenAI
	}
}

func weightedTokenEstimate(text string, family estimatorFamily) int64 {
	if text == "" {
		return 0
	}
	multiplier, ok := familyMultipliers[family]
	if !ok {
		multiplier = familyMultipliers[estimatorOpenAI]
	}

	type wordType uint8
	const (
		noWord wordType = iota
		latinWord
		numberWord
	)

	var count float64
	current := noWord
	for _, r := range text {
		if unicode.IsSpace(r) {
			current = noWord
			if r == '\n' || r == '\t' {
				count += multiplier.newline
			} else {
				count += multiplier.space
			}
			continue
		}
		if isCJK(r) {
			current = noWord
			count += multiplier.cjk
			continue
		}
		if isEmoji(r) {
			current = noWord
			count += multiplier.emoji
			continue
		}
		if unicode.IsLetter(r) || unicode.IsNumber(r) {
			next := latinWord
			if unicode.IsNumber(r) {
				next = numberWord
			}
			if current == noWord || current != next {
				if next == numberWord {
					count += multiplier.number
				} else {
					count += multiplier.word
				}
				current = next
			}
			continue
		}

		current = noWord
		switch {
		case isMathSymbol(r):
			count += multiplier.mathSymbol
		case r == '@':
			count += multiplier.atSign
		case isURLDelimiter(r):
			count += multiplier.urlDelim
		default:
			count += multiplier.symbol
		}
	}

	result := math.Ceil(count)
	if result >= float64(math.MaxInt64-multiplier.basePad) {
		return math.MaxInt64
	}
	return int64(result) + multiplier.basePad
}

func isCJK(r rune) bool {
	return unicode.Is(unicode.Han, r) ||
		(r >= 0x3040 && r <= 0x30FF) ||
		(r >= 0xAC00 && r <= 0xD7A3)
}

func isEmoji(r rune) bool {
	return (r >= 0x1F300 && r <= 0x1F9FF) ||
		(r >= 0x2600 && r <= 0x26FF) ||
		(r >= 0x2700 && r <= 0x27BF) ||
		(r >= 0x1F600 && r <= 0x1F64F) ||
		(r >= 0x1F900 && r <= 0x1F9FF) ||
		(r >= 0x1FA00 && r <= 0x1FAFF)
}

func isMathSymbol(r rune) bool {
	const symbols = "∑∫∂√∞≤≥≠≈±×÷∈∉∋∌⊂⊃⊆⊇∪∩∧∨¬∀∃∄∅∆∇∝∟∠∡∢°′″‴⁺⁻⁼⁽⁾ⁿ₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎²³¹⁴⁵⁶⁷⁸⁹⁰"
	for _, symbol := range symbols {
		if r == symbol {
			return true
		}
	}
	return (r >= 0x2200 && r <= 0x22FF) ||
		(r >= 0x2A00 && r <= 0x2AFF) ||
		(r >= 0x1D400 && r <= 0x1D7FF)
}

func isURLDelimiter(r rune) bool {
	return strings.ContainsRune("/:?&=;#%", r)
}
