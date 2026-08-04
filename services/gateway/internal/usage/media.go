package usage

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"strings"
	"sync"
)

type mediaKind uint8

const (
	mediaImage mediaKind = iota
	mediaTranscription
	mediaSpeech
)

type mediaObserver struct {
	kind        mediaKind
	contentType string
	estimate    Estimate
	body        *responseStore
	mu          sync.Mutex
}

func newMediaObserver(kind mediaKind, contentType string, estimate Estimate) *mediaObserver {
	return &mediaObserver{
		kind:        kind,
		contentType: contentType,
		estimate:    estimate,
		body:        newResponseStore(),
	}
}

func (observer *mediaObserver) Observe(chunk []byte) error {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	_, err := observer.body.Write(chunk)
	return err
}

func (observer *mediaObserver) Complete(completion Completion) (Canonical, error) {
	observer.mu.Lock()
	defer observer.mu.Unlock()

	body, err := observer.body.Open()
	if err != nil {
		return Canonical{Fields: make(map[string]Provenance)}, err
	}
	defer observer.body.Close()
	defer body.Close()

	var result Canonical
	switch observer.kind {
	case mediaImage:
		result, err = normalizeImageResponse(body, observer.estimate)
	case mediaTranscription:
		result, err = normalizeTranscriptionResponse(body, observer.estimate)
	case mediaSpeech:
		result, err = normalizeSpeechResponse(body, observer.body.Size(), observer.contentType, observer.estimate)
	default:
		err = fmt.Errorf("unsupported media usage observer")
	}
	if err != nil {
		if result.Fields == nil {
			result.Fields = make(map[string]Provenance)
		}
		result.TerminalEvent = "malformed_response"
		return result, err
	}
	terminal := "json.eof"
	if observer.kind == mediaSpeech {
		terminal = "binary.eof"
	}
	finishMediaCompletion(&result, completion, terminal)
	return result, nil
}

func normalizeImageResponse(reader io.Reader, _ Estimate) (Canonical, error) {
	response, err := decodeMediaObject(reader)
	if err != nil {
		return Canonical{Fields: make(map[string]Provenance)}, err
	}
	usage, _ := objectValue(response["usage"])
	// Image endpoints do not have a reliable request-token estimate. If the
	// provider omits usage, retain one billable unit instead of a text estimate.
	result, err := normalizeMediaUsage(usage, Estimate{})
	if err != nil {
		return result, err
	}
	if noBillableTokens(result) {
		result.TextInputTokens = 1
		result.Fields["text_input_tokens"] = Derived
	}
	count := int64(len(arrayValue(response["data"])))
	if count == 0 {
		if declared, present, numberErr := nonNegativeInt64(response, "n"); numberErr != nil {
			return result, numberErr
		} else if present && declared > 0 {
			count = declared
		} else {
			count = 1
		}
	}
	key := imageCallKey(response)
	result.Calls = map[string]int64{key: count}
	result.Fields["calls."+key] = Upstream
	return result, nil
}

func normalizeTranscriptionResponse(reader io.Reader, estimate Estimate) (Canonical, error) {
	response, err := decodeMediaObject(reader)
	if err != nil {
		return Canonical{Fields: make(map[string]Provenance)}, err
	}
	usage, _ := objectValue(response["usage"])
	return normalizeMediaUsage(usage, estimate)
}

func normalizeMediaUsage(usage map[string]any, estimate Estimate) (Canonical, error) {
	if usage == nil {
		return normalizeOpenAIUsage(nil, "responses", estimate)
	}
	if _, hasInput := usage["input_tokens"]; hasInput {
		return normalizeOpenAIUsage(usage, "responses", estimate)
	}
	if _, hasOutput := usage["output_tokens"]; hasOutput {
		return normalizeOpenAIUsage(usage, "responses", estimate)
	}
	return normalizeOpenAIUsage(usage, "openai", estimate)
}

func normalizeSpeechResponse(reader io.Reader, bodySize int64, contentType string, estimate Estimate) (Canonical, error) {
	result := Canonical{Fields: make(map[string]Provenance)}
	if estimate.PromptTokens > 0 {
		result.TextInputTokens = estimate.PromptTokens
		result.Fields["text_input_tokens"] = RequestEstimate
	}

	duration, exact := speechDurationMilliseconds(reader, bodySize, contentType)
	if exact && duration > 0 {
		result.DurationMilliseconds = duration
		result.Fields["duration_milliseconds"] = Derived
		result.AudioOutputTokens = durationTokenCount(duration)
	} else {
		result.AudioOutputTokens = ceilDiv(bodySize, 1000)
	}
	if result.AudioOutputTokens > 0 {
		result.Fields["audio_output_tokens"] = Derived
	}
	return result, nil
}

func decodeMediaObject(reader io.Reader) (map[string]any, error) {
	decoder := json.NewDecoder(reader)
	decoder.UseNumber()
	var response map[string]any
	if err := decoder.Decode(&response); err != nil || response == nil {
		if err == nil {
			err = fmt.Errorf("response must be a JSON object")
		}
		return nil, fmt.Errorf("decode media response: %w", err)
	}
	return response, nil
}

func noBillableTokens(usage Canonical) bool {
	return usage.TextInputTokens == 0 && usage.TextOutputTokens == 0 &&
		usage.ReasoningTokens == 0 && usage.CacheReadTokens == 0 &&
		usage.ImageInputTokens == 0 && usage.ImageOutputTokens == 0 &&
		usage.AudioInputTokens == 0 && usage.AudioOutputTokens == 0
}

func imageCallKey(response map[string]any) string {
	size, _ := response["size"].(string)
	quality, _ := response["quality"].(string)
	size = normalizedCallPart(size, "unspecified")
	quality = normalizedCallPart(quality, "standard")
	return "image_generation:" + size + ":" + quality
}

func applyResponseImageCalls(result *Canonical, response map[string]any) {
	if response == nil {
		return
	}
	for _, outputValue := range arrayValue(response["output"]) {
		output, ok := objectValue(outputValue)
		if !ok {
			continue
		}
		typeName, _ := output["type"].(string)
		if typeName != "image_generation_call" {
			continue
		}
		key := imageCallKey(output)
		if result.Calls == nil {
			result.Calls = make(map[string]int64)
		}
		result.Calls[key]++
		result.Fields["calls."+key] = Upstream
	}
}

func normalizedCallPart(value, fallback string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" {
		return fallback
	}
	var output strings.Builder
	for _, char := range value {
		if (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') || char == 'x' || char == '-' || char == '_' || char == '.' {
			output.WriteRune(char)
		}
	}
	if output.Len() == 0 {
		return fallback
	}
	return output.String()
}

func finishMediaCompletion(result *Canonical, completion Completion, terminal string) {
	if completion.ClientDisconnected {
		result.TerminalEvent = "client_disconnected"
		return
	}
	if completion.Err != nil {
		result.TerminalEvent = "relay_error"
		return
	}
	if completion.EOF && isSuccessStatus(completion.StatusCode) {
		result.Complete = true
		result.TerminalEvent = terminal
		return
	}
	if completion.EOF {
		result.TerminalEvent = "eof_without_success"
	}
}

func speechDurationMilliseconds(reader io.Reader, bodySize int64, contentType string) (int64, bool) {
	mediaType := strings.ToLower(strings.TrimSpace(strings.SplitN(contentType, ";", 2)[0]))
	if strings.Contains(mediaType, "pcm") || mediaType == "audio/l16" {
		return bytesToMilliseconds(bodySize, 24_000*2), bodySize > 0
	}
	if mediaType != "audio/wav" && mediaType != "audio/x-wav" && mediaType != "audio/wave" {
		return 0, false
	}
	prefix, err := io.ReadAll(io.LimitReader(reader, 64*1024))
	if err != nil {
		return 0, false
	}
	return wavDurationMilliseconds(prefix, bodySize)
}

func wavDurationMilliseconds(prefix []byte, bodySize int64) (int64, bool) {
	if len(prefix) < 12 || !bytes.Equal(prefix[:4], []byte("RIFF")) || !bytes.Equal(prefix[8:12], []byte("WAVE")) {
		return 0, false
	}
	var byteRate int64
	position := 12
	for position+8 <= len(prefix) {
		chunkID := string(prefix[position : position+4])
		chunkSize := int64(binary.LittleEndian.Uint32(prefix[position+4 : position+8]))
		dataStart := position + 8
		if chunkSize < 0 || int64(dataStart)+chunkSize > bodySize {
			return 0, false
		}
		switch chunkID {
		case "fmt ":
			if chunkSize < 16 || dataStart+16 > len(prefix) {
				return 0, false
			}
			if binary.LittleEndian.Uint16(prefix[dataStart:dataStart+2]) != 1 {
				return 0, false
			}
			byteRate = int64(binary.LittleEndian.Uint32(prefix[dataStart+8 : dataStart+12]))
		case "data":
			if byteRate <= 0 {
				return 0, false
			}
			return bytesToMilliseconds(chunkSize, byteRate), true
		}
		next := int64(dataStart) + chunkSize
		if chunkSize%2 != 0 {
			next++
		}
		if next > int64(len(prefix)) {
			return 0, false
		}
		position = int(next)
	}
	return 0, false
}

func bytesToMilliseconds(byteCount, bytesPerSecond int64) int64 {
	if byteCount <= 0 || bytesPerSecond <= 0 {
		return 0
	}
	seconds := byteCount / bytesPerSecond
	remainder := byteCount % bytesPerSecond
	if seconds > math.MaxInt64/1000 {
		return math.MaxInt64
	}
	milliseconds := seconds * 1000
	if remainder == 0 {
		return milliseconds
	}
	if remainder > math.MaxInt64/1000 {
		return math.MaxInt64
	}
	additional := ceilDiv(remainder*1000, bytesPerSecond)
	if milliseconds > math.MaxInt64-additional {
		return math.MaxInt64
	}
	return milliseconds + additional
}

func durationTokenCount(durationMilliseconds int64) int64 {
	if durationMilliseconds <= 0 {
		return 0
	}
	seconds := ceilDiv(durationMilliseconds, 1000)
	if seconds > (math.MaxInt64-30)/1000 {
		return math.MaxInt64
	}
	return (seconds*1000 + 30) / 60
}

func ceilDiv(value, divisor int64) int64 {
	if value <= 0 || divisor <= 0 {
		return 0
	}
	return 1 + (value-1)/divisor
}
