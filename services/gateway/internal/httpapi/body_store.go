package httpapi

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"sync"
)

const (
	defaultBodyMemoryThresholdBytes int64 = 1024 * 1024
	defaultBodyMaxBytes             int64 = 50 * 1024 * 1024
)

var (
	ErrBodyTooLarge    = errors.New("request body exceeds configured limit")
	ErrBodyStoreClosed = errors.New("request body store is closed")
)

// BodyStoreOptions bounds memory, total size, and spill-file placement.
type BodyStoreOptions struct {
	MemoryThresholdBytes int64
	MaxBytes             int64
	TempDir              string
}

// BodyStore retains a request body for one or more relay attempts.
type BodyStore struct {
	mu     sync.Mutex
	memory []byte
	path   string
	size   int64
	closed bool
}

// NewBodyStore reads a bounded source once and keeps it in memory or an
// owner-only temporary file according to the configured threshold.
func NewBodyStore(source io.Reader, options BodyStoreOptions) (*BodyStore, error) {
	threshold := options.MemoryThresholdBytes
	if threshold <= 0 {
		threshold = defaultBodyMemoryThresholdBytes
	}
	maxBytes := options.MaxBytes
	if maxBytes <= 0 {
		maxBytes = defaultBodyMaxBytes
	}

	store := &BodyStore{}
	if source == nil {
		return store, nil
	}

	var memory bytes.Buffer
	var spill *os.File
	cleanup := func() {
		if spill != nil {
			_ = spill.Close()
			_ = os.Remove(spill.Name())
		}
	}

	buffer := make([]byte, 32*1024)
	for {
		count, readErr := source.Read(buffer)
		if count > 0 {
			if store.size > maxBytes-int64(count) {
				cleanup()
				return nil, ErrBodyTooLarge
			}
			if spill == nil && store.size+int64(count) > threshold {
				var err error
				spill, err = os.CreateTemp(options.TempDir, "winlume-gateway-body-*")
				if err != nil {
					return nil, fmt.Errorf("create request body spill file: %w", err)
				}
				if err = secureSpillFile(spill); err != nil {
					cleanup()
					return nil, fmt.Errorf("secure request body spill file: %w", err)
				}
				if _, err = spill.Write(memory.Bytes()); err != nil {
					cleanup()
					return nil, fmt.Errorf("write request body spill file: %w", err)
				}
				memory.Reset()
			}

			var writeErr error
			if spill == nil {
				_, writeErr = memory.Write(buffer[:count])
			} else {
				_, writeErr = spill.Write(buffer[:count])
			}
			if writeErr != nil {
				cleanup()
				return nil, fmt.Errorf("write request body: %w", writeErr)
			}
			store.size += int64(count)
		}

		if readErr != nil {
			if !errors.Is(readErr, io.EOF) {
				cleanup()
				return nil, fmt.Errorf("read request body: %w", readErr)
			}
			break
		}
	}

	if spill == nil {
		store.memory = append([]byte(nil), memory.Bytes()...)
		return store, nil
	}
	if err := spill.Close(); err != nil {
		cleanup()
		return nil, fmt.Errorf("close request body spill file: %w", err)
	}
	store.path = spill.Name()
	return store, nil
}

// Open returns a fresh reader positioned at the beginning of the body.
func (store *BodyStore) Open() (io.ReadCloser, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.closed {
		return nil, ErrBodyStoreClosed
	}
	if store.path != "" {
		reader, err := os.Open(store.path)
		if err != nil {
			return nil, fmt.Errorf("open request body spill file: %w", err)
		}
		return reader, nil
	}
	return io.NopCloser(bytes.NewReader(store.memory)), nil
}

// Size returns the exact body size used for upstream Content-Length.
func (store *BodyStore) Size() int64 {
	store.mu.Lock()
	defer store.mu.Unlock()
	return store.size
}

// InMemory reports whether the store avoided a spill file.
func (store *BodyStore) InMemory() bool {
	store.mu.Lock()
	defer store.mu.Unlock()
	return store.path == ""
}

// Close deletes any spill file and prevents future opens. It is idempotent.
func (store *BodyStore) Close() error {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.closed && store.path == "" {
		return nil
	}
	store.closed = true
	store.memory = nil
	if store.path == "" {
		return nil
	}
	err := os.Remove(store.path)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove request body spill file: %w", err)
	}
	store.path = ""
	return nil
}
