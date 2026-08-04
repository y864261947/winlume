package usage

import (
	"bytes"
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
	ErrResponseStoreClosed      = errors.New("usage response store is closed")
)

const responseMemoryThresholdBytes int64 = 1024 * 1024

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
type Registry struct{}

func NewRegistry() *Registry {
	return &Registry{}
}

func (registry *Registry) New(protocol string, contentType string, estimate Estimate) (Observer, error) {
	switch strings.ToLower(strings.TrimSpace(protocol)) {
	case "image", "images", "openai_image", "openai_images":
		return newMediaObserver(mediaImage, contentType, estimate), nil
	case "audio_transcription", "audio_translation", "transcription", "translation":
		return newMediaObserver(mediaTranscription, contentType, estimate), nil
	case "audio_speech", "speech", "tts":
		return newMediaObserver(mediaSpeech, contentType, estimate), nil
	case "audio", "openai_audio":
		if isJSONContentType(contentType) {
			return newMediaObserver(mediaTranscription, contentType, estimate), nil
		}
		return newMediaObserver(mediaSpeech, contentType, estimate), nil
	}
	resolved, ok := normalizeProtocol(protocol)
	if !ok || (resolved != "openai" && resolved != "responses") {
		return nil, ErrUnsupportedUsageProtocol
	}
	return newOpenAIObserver(resolved, contentType, estimate), nil
}

func isSuccessStatus(statusCode int) bool {
	return statusCode == 0 || (statusCode >= http.StatusOK && statusCode < http.StatusMultipleChoices)
}

func isSSEContentType(contentType string) bool {
	mediaType := strings.TrimSpace(strings.SplitN(contentType, ";", 2)[0])
	return strings.EqualFold(mediaType, "text/event-stream")
}

func isJSONContentType(contentType string) bool {
	mediaType := strings.TrimSpace(strings.SplitN(contentType, ";", 2)[0])
	return strings.EqualFold(mediaType, "application/json") || strings.HasSuffix(strings.ToLower(mediaType), "+json")
}

// responseStore keeps a non-stream upstream response available for exactly
// one parser pass while avoiding unbounded heap growth. It owns its spill file
// and must be closed after parsing.
type responseStore struct {
	mu     sync.Mutex
	memory bytes.Buffer
	file   *os.File
	path   string
	size   int64
	closed bool
}

func newResponseStore() *responseStore {
	return &responseStore{}
}

func (store *responseStore) Write(chunk []byte) (int, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.closed {
		return 0, ErrResponseStoreClosed
	}
	if store.file == nil && int64(store.memory.Len()+len(chunk)) > responseMemoryThresholdBytes {
		file, err := os.CreateTemp("", "winlume-gateway-response-*")
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
