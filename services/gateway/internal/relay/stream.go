package relay

import (
	"bufio"
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
)

// StreamResponse copies a response with immediate SSE flushing and exactly one
// observer completion callback.
func StreamResponse(ctx context.Context, downstream http.ResponseWriter, upstream *http.Response, observer Observer) (completion Completion) {
	completion.StatusCode = upstream.StatusCode
	completion.Headers = FilterResponseHeaders(upstream.Header)
	defer func() {
		if observer != nil {
			observer.Complete(ctx, completion)
		}
	}()

	for name, values := range completion.Headers {
		for _, value := range values {
			downstream.Header().Add(name, value)
		}
	}
	downstream.WriteHeader(upstream.StatusCode)

	if upstream.Body == nil {
		completion.EOF = true
		return completion
	}
	defer upstream.Body.Close()

	flusher, canFlush := downstream.(http.Flusher)
	isSSE := strings.HasPrefix(strings.ToLower(upstream.Header.Get("Content-Type")), "text/event-stream")
	writeChunk := func(chunk []byte) bool {
		observed := append([]byte(nil), chunk...)
		if observer != nil {
			observer.Observe(ctx, observed)
		}
		written, writeErr := downstream.Write(chunk)
		completion.BytesWritten += int64(written)
		if writeErr == nil && written != len(chunk) {
			writeErr = io.ErrShortWrite
		}
		if writeErr != nil {
			completion.Err = writeErr
			completion.ClientDisconnected = ctx.Err() != nil
			return false
		}
		return true
	}

	if isSSE {
		reader := bufio.NewReaderSize(upstream.Body, 32*1024)
		for {
			segment, readErr := reader.ReadSlice('\n')
			if len(segment) > 0 && !writeChunk(segment) {
				return completion
			}
			if readErr == nil && (string(segment) == "\n" || string(segment) == "\r\n") {
				if canFlush {
					flusher.Flush()
				}
			}
			if errors.Is(readErr, bufio.ErrBufferFull) {
				continue
			}
			if readErr != nil {
				if len(segment) > 0 && canFlush {
					flusher.Flush()
				}
				if errors.Is(readErr, io.EOF) {
					completion.EOF = true
				} else {
					completion.Err = readErr
					completion.ClientDisconnected = ctx.Err() != nil
				}
				return completion
			}
		}
	}

	buffer := make([]byte, 32*1024)
	for {
		count, readErr := upstream.Body.Read(buffer)
		if count > 0 {
			if !writeChunk(buffer[:count]) {
				return completion
			}
		}

		if readErr != nil {
			if errors.Is(readErr, io.EOF) {
				completion.EOF = true
			} else {
				completion.Err = readErr
				completion.ClientDisconnected = ctx.Err() != nil
			}
			return completion
		}
	}
}
