package usage

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
)

var (
	ErrUnsupportedUsageProtocol = errors.New("unsupported usage response protocol")
	ErrMalformedSSE             = errors.New("malformed SSE usage event")
	ErrSSEEventTooLarge         = errors.New("SSE usage event exceeds maximum size")
	ErrObservationLimitExceeded = errors.New("usage observation limit exceeded")
	ErrObserverFinalized        = errors.New("usage observer has already been finalized")
	ErrResponseStoreClosed      = errors.New("usage response store is closed")
)

const (
	responseMemoryThresholdBytes int64 = 1024 * 1024
	defaultMaxFallbackBytes      int64 = 8 * 1024 * 1024
	defaultMaxResponseBytes      int64 = 50 * 1024 * 1024
)

// Limits bounds retained upstream response data. Zero-value fields use the
// secure defaults so callers can override only the limit they need to tune.
type Limits struct {
	MaxEventBytes       int64
	MaxFallbackBytes    int64
	MaxResponseBytes    int64
	SpillThresholdBytes int64
}

func DefaultLimits() Limits {
	return Limits{
		MaxEventBytes:       maxSSEEventBytes,
		MaxFallbackBytes:    defaultMaxFallbackBytes,
		MaxResponseBytes:    defaultMaxResponseBytes,
		SpillThresholdBytes: responseMemoryThresholdBytes,
	}
}

func normalizeLimits(limits Limits) Limits {
	defaults := DefaultLimits()
	if limits.MaxEventBytes <= 0 {
		limits.MaxEventBytes = defaults.MaxEventBytes
	}
	if limits.MaxFallbackBytes <= 0 {
		limits.MaxFallbackBytes = defaults.MaxFallbackBytes
	}
	if limits.MaxResponseBytes <= 0 {
		limits.MaxResponseBytes = defaults.MaxResponseBytes
	}
	if limits.SpillThresholdBytes <= 0 {
		limits.SpillThresholdBytes = defaults.SpillThresholdBytes
	}
	if limits.SpillThresholdBytes > limits.MaxResponseBytes {
		limits.SpillThresholdBytes = limits.MaxResponseBytes
	}
	return limits
}

// Completion records the relay result relevant to usage finalization. It
// deliberately mirrors the transport facts without retaining response data.
type Completion struct {
	StatusCode         int
	Headers            http.Header
	BytesWritten       int64
	EOF                bool
	Err                error
	ClientDisconnected bool
}

// Observer receives upstream response bytes before they are sent downstream
// and produces sanitized, provider-neutral usage on completion.
type Observer interface {
	Observe([]byte) error
	Complete(Completion) (Canonical, error)
}

// Factory chooses a protocol-specific observer for one upstream response.
type Factory interface {
	New(protocol string, contentType string, estimate Estimate) (Observer, error)
}

// Registry is the initial provider usage observer factory.
type Registry struct {
	limits Limits
}

func NewRegistry() *Registry {
	return NewRegistryWithLimits(DefaultLimits())
}

func NewRegistryWithLimits(limits Limits) *Registry {
	return &Registry{limits: normalizeLimits(limits)}
}

func (registry *Registry) New(protocol string, contentType string, estimate Estimate) (Observer, error) {
	limits := normalizeLimits(registry.limits)
	switch strings.ToLower(strings.TrimSpace(protocol)) {
	case "image", "images", "openai_image", "openai_images":
		return newMediaObserverWithLimits(mediaImage, contentType, estimate, limits), nil
	case "audio_transcription", "audio_translation", "transcription", "translation":
		return newMediaObserverWithLimits(mediaTranscription, contentType, estimate, limits), nil
	case "audio_speech", "speech", "tts":
		return newMediaObserverWithLimits(mediaSpeech, contentType, estimate, limits), nil
	case "audio", "openai_audio":
		if isJSONContentType(contentType) {
			return newMediaObserverWithLimits(mediaTranscription, contentType, estimate, limits), nil
		}
		return newMediaObserverWithLimits(mediaSpeech, contentType, estimate, limits), nil
	}
	resolved, ok := normalizeProtocol(protocol)
	if !ok {
		return nil, ErrUnsupportedUsageProtocol
	}
	switch resolved {
	case "openai", "responses":
		return newOpenAIObserverWithLimits(resolved, contentType, estimate, limits), nil
	case "claude":
		return newAnthropicObserverWithLimits(contentType, estimate, limits), nil
	default:
		return nil, ErrUnsupportedUsageProtocol
	}
}

func isSuccessStatus(statusCode int) bool {
	return statusCode == 0 || (statusCode >= http.StatusOK && statusCode < http.StatusMultipleChoices)
}

func incompleteCompletionTerminal(completion Completion) string {
	if completion.ClientDisconnected {
		return "client_disconnected"
	}
	if completion.Err != nil {
		return "relay_error"
	}
	if !completion.EOF {
		return "incomplete_response"
	}
	if !isSuccessStatus(completion.StatusCode) {
		return "eof_without_success"
	}
	return ""
}

func isSSEContentType(contentType string) bool {
	mediaType := strings.TrimSpace(strings.SplitN(contentType, ";", 2)[0])
	return strings.EqualFold(mediaType, "text/event-stream")
}

func isJSONContentType(contentType string) bool {
	mediaType := strings.TrimSpace(strings.SplitN(contentType, ";", 2)[0])
	return strings.EqualFold(mediaType, "application/json") || strings.HasSuffix(strings.ToLower(mediaType), "+json")
}

func decodeStrictJSONObject(reader io.Reader) (map[string]any, error) {
	decoder := json.NewDecoder(reader)
	decoder.UseNumber()
	var response map[string]any
	if err := decoder.Decode(&response); err != nil || response == nil {
		if err == nil {
			err = errors.New("response must be a JSON object")
		}
		return nil, err
	}
	var additional any
	if err := decoder.Decode(&additional); err != io.EOF {
		if err == nil {
			return nil, errors.New("response contains multiple JSON values")
		}
		return nil, fmt.Errorf("response contains trailing JSON data: %w", err)
	}
	return response, nil
}

// responseStore keeps a non-stream upstream response available for exactly
// one parser pass while avoiding unbounded heap growth. It owns its spill file
// and must be closed after parsing.
type responseStore struct {
	mu             sync.Mutex
	memory         bytes.Buffer
	file           *os.File
	path           string
	size           int64
	maxBytes       int64
	spillThreshold int64
	observationErr error
	closed         bool
}

func newResponseStore() *responseStore {
	return newResponseStoreWithLimits(DefaultLimits())
}

func newResponseStoreWithLimits(limits Limits) *responseStore {
	limits = normalizeLimits(limits)
	return &responseStore{maxBytes: limits.MaxResponseBytes, spillThreshold: limits.SpillThresholdBytes}
}

func (store *responseStore) Write(chunk []byte) (int, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.closed {
		return 0, ErrResponseStoreClosed
	}
	if store.observationErr != nil {
		return 0, store.observationErr
	}
	if int64(len(chunk)) > store.maxBytes-store.size {
		store.observationErr = ErrObservationLimitExceeded
		return 0, store.observationErr
	}
	if store.file == nil && int64(store.memory.Len()+len(chunk)) > store.spillThreshold {
		file, err := os.CreateTemp("", "reizo-gateway-response-*")
		if err != nil {
			return 0, fmt.Errorf("create usage response spill file: %w", err)
		}
		if err = file.Chmod(0o600); err != nil {
			_ = file.Close()
			_ = os.Remove(file.Name())
			return 0, fmt.Errorf("secure usage response spill file: %w", err)
		}
		if _, err = file.Write(store.memory.Bytes()); err != nil {
			_ = file.Close()
			_ = os.Remove(file.Name())
			return 0, fmt.Errorf("write usage response spill file: %w", err)
		}
		store.memory.Reset()
		store.file = file
		store.path = file.Name()
	}
	var (
		count int
		err   error
	)
	if store.file != nil {
		count, err = store.file.Write(chunk)
	} else {
		count, err = store.memory.Write(chunk)
	}
	store.size += int64(count)
	return count, err
}

func (store *responseStore) ObservationError() error {
	store.mu.Lock()
	defer store.mu.Unlock()
	return store.observationErr
}

func (store *responseStore) Open() (io.ReadCloser, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.closed {
		return nil, ErrResponseStoreClosed
	}
	if store.file == nil {
		return io.NopCloser(bytes.NewReader(store.memory.Bytes())), nil
	}
	if err := store.file.Sync(); err != nil {
		return nil, fmt.Errorf("sync usage response spill file: %w", err)
	}
	reader, err := os.Open(store.path)
	if err != nil {
		return nil, fmt.Errorf("open usage response spill file: %w", err)
	}
	return reader, nil
}

func (store *responseStore) InMemory() bool {
	store.mu.Lock()
	defer store.mu.Unlock()
	return store.file == nil
}

func (store *responseStore) Size() int64 {
	store.mu.Lock()
	defer store.mu.Unlock()
	return store.size
}

func (store *responseStore) Close() error {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.closed {
		return nil
	}
	store.closed = true
	store.memory.Reset()
	if store.file == nil {
		return nil
	}
	closeErr := store.file.Close()
	removeErr := os.Remove(store.path)
	if closeErr != nil {
		return fmt.Errorf("close usage response spill file: %w", closeErr)
	}
	if removeErr != nil && !errors.Is(removeErr, os.ErrNotExist) {
		return fmt.Errorf("remove usage response spill file: %w", removeErr)
	}
	return nil
}
