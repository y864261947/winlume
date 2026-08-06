package httpapi

import (
	"bytes"
	"errors"
	"io"
	"os"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestBodyStoreKeepsSmallBodiesInMemoryAndReopensThem(t *testing.T) {
	payload := []byte(`{"model":"gpt-test"}`)
	store, err := NewBodyStore(bytes.NewReader(payload), BodyStoreOptions{
		MemoryThresholdBytes: 1024,
		MaxBytes:             4096,
		TempDir:              t.TempDir(),
	})
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, store.Close()) })
	require.True(t, store.InMemory())
	require.Equal(t, int64(len(payload)), store.Size())

	for range 2 {
		reader, openErr := store.Open()
		require.NoError(t, openErr)
		actual, readErr := io.ReadAll(reader)
		require.NoError(t, readErr)
		require.NoError(t, reader.Close())
		require.Equal(t, payload, actual)
	}
}

func TestBodyStoreSpillsLargeBodiesToOwnerOnlyFileAndDeletesIt(t *testing.T) {
	tempDir := t.TempDir()
	payload := bytes.Repeat([]byte("multipart-byte-"), 64)
	store, err := NewBodyStore(bytes.NewReader(payload), BodyStoreOptions{
		MemoryThresholdBytes: 32,
		MaxBytes:             int64(len(payload) + 1),
		TempDir:              tempDir,
	})
	require.NoError(t, err)
	require.False(t, store.InMemory())
	require.NotEmpty(t, store.path)

	assertOwnerOnlySpillFile(t, store.path)

	for range 2 {
		reader, openErr := store.Open()
		require.NoError(t, openErr)
		actual, readErr := io.ReadAll(reader)
		require.NoError(t, readErr)
		require.NoError(t, reader.Close())
		require.Equal(t, payload, actual)
	}

	path := store.path
	require.NoError(t, store.Close())
	_, err = os.Stat(path)
	require.ErrorIs(t, err, os.ErrNotExist)
	require.NoError(t, store.Close(), "close must be idempotent")
	_, err = store.Open()
	require.ErrorIs(t, err, ErrBodyStoreClosed)
}

func TestBodyStoreRejectsBodiesOverLimitWithoutLeakingFiles(t *testing.T) {
	tempDir := t.TempDir()
	_, err := NewBodyStore(bytes.NewReader(bytes.Repeat([]byte("x"), 65)), BodyStoreOptions{
		MemoryThresholdBytes: 8,
		MaxBytes:             64,
		TempDir:              tempDir,
	})
	require.ErrorIs(t, err, ErrBodyTooLarge)

	entries, readErr := os.ReadDir(tempDir)
	require.NoError(t, readErr)
	require.Empty(t, entries)
}

func TestBodyStoreCleansUpAfterSourceReadFailure(t *testing.T) {
	tempDir := t.TempDir()
	_, err := NewBodyStore(&failingBodyReader{remaining: bytes.Repeat([]byte("x"), 32)}, BodyStoreOptions{
		MemoryThresholdBytes: 8,
		MaxBytes:             64,
		TempDir:              tempDir,
	})
	require.ErrorContains(t, err, "read request body")

	entries, readErr := os.ReadDir(tempDir)
	require.NoError(t, readErr)
	require.Empty(t, entries)
}

type failingBodyReader struct {
	remaining []byte
}

func (reader *failingBodyReader) Read(target []byte) (int, error) {
	if len(reader.remaining) == 0 {
		return 0, errors.New("source failed")
	}
	n := copy(target, reader.remaining)
	reader.remaining = reader.remaining[n:]
	return n, nil
}
