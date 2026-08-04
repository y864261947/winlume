package relay

import (
	"bufio"
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"winlume/services/gateway/internal/config"
)

func TestProxyPreservesQueryMultipartBodyAndSafeHeadersAcrossReopens(t *testing.T) {
	multipartBody := []byte("--boundary\r\nContent-Disposition: form-data; name=\"prompt\"\r\n\r\nhello\r\n--boundary--\r\n")
	type capturedRequest struct {
		path, rawQuery, host, authorization, requestID, callerAuthorization, forwarded string
		body                                                                           []byte
	}
	captured := make(chan capturedRequest, 2)
	upstream := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		body, err := io.ReadAll(request.Body)
		require.NoError(t, err)
		captured <- capturedRequest{
			path:                request.URL.Path,
			rawQuery:            request.URL.RawQuery,
			host:                request.Host,
			authorization:       request.Header.Get("Authorization"),
			requestID:           request.Header.Get("x-request-id"),
			callerAuthorization: request.Header.Get("x-api-key"),
			forwarded:           request.Header.Get("x-forwarded-for"),
			body:                body,
		}
		response.Header().Set("Content-Type", "application/json")
		_, _ = response.Write([]byte(`{"ok":true}`))
	}))
	defer upstream.Close()

	baseURL, err := url.Parse(upstream.URL + "/base")
	require.NoError(t, err)
	selector := &fixedSelector{channel: Channel{
		ID:            "openai-test",
		Family:        "openai",
		BaseURL:       baseURL,
		Authorization: "Bearer upstream-service-token",
	}}
	client := NewClient(selector, ClientOptions{HTTPClient: upstream.Client()})
	incomingURL := &url.URL{Path: "/v1/images/edits", RawQuery: "a=1%202&b=%2F"}
	body := &memoryReplayBody{payload: multipartBody}
	request := Request{
		Method: http.MethodPost,
		Family: "openai",
		URL:    incomingURL,
		Headers: http.Header{
			"Authorization":   {"Bearer caller-key"},
			"x-api-key":       {"caller-key"},
			"x-forwarded-for": {"198.51.100.10"},
			"Content-Type":    {"multipart/form-data; boundary=boundary"},
		},
		Body:      body,
		RequestID: "request-12345678",
	}

	for attempt := 0; attempt < 2; attempt++ {
		upstreamResponse, doErr := client.Do(context.Background(), request, nil)
		require.NoError(t, doErr)
		_, readErr := io.Copy(io.Discard, upstreamResponse.Body)
		require.NoError(t, readErr)
		require.NoError(t, upstreamResponse.Body.Close())

		actual := <-captured
		require.Equal(t, "/base/v1/images/edits", actual.path)
		require.Equal(t, "a=1%202&b=%2F", actual.rawQuery)
		require.Equal(t, baseURL.Host, actual.host)
		require.Equal(t, "Bearer upstream-service-token", actual.authorization)
		require.Equal(t, "request-12345678", actual.requestID)
		require.Empty(t, actual.callerAuthorization)
		require.Empty(t, actual.forwarded)
		require.Equal(t, multipartBody, actual.body)
	}
	require.Equal(t, 2, body.opens)
}

func TestProxyStaticSelectorReturnsIndependentChannelsAndNoChannelError(t *testing.T) {
	selector, err := NewStaticSelector(map[config.ProtocolFamily]config.UpstreamConfig{
		config.ProtocolOpenAI: {
			BaseURL:       "https://provider.example/v1",
			Authorization: "raw-api-key",
		},
	})
	require.NoError(t, err)

	channel, err := selector.Select(context.Background(), Request{Family: "openai"}, nil)
	require.NoError(t, err)
	require.Equal(t, "openai-environment", channel.ID)
	require.Equal(t, "Bearer raw-api-key", channel.Authorization)
	channel.BaseURL.Host = "mutated.example"

	again, err := selector.Select(context.Background(), Request{Family: "openai"}, nil)
	require.NoError(t, err)
	require.Equal(t, "provider.example", again.BaseURL.Host)
	_, err = selector.Select(context.Background(), Request{Family: "claude"}, nil)
	require.ErrorIs(t, err, ErrNoChannel)
}

func TestProxyReturnsClassifiedErrorWhenUpstreamTransportFails(t *testing.T) {
	baseURL, err := url.Parse("http://127.0.0.1:1")
	require.NoError(t, err)
	client := NewClient(&fixedSelector{channel: Channel{ID: "broken", Family: "openai", BaseURL: baseURL}}, ClientOptions{})

	_, err = client.Do(context.Background(), Request{
		Method: http.MethodGet,
		Family: "openai",
		URL:    &url.URL{Path: "/v1/models"},
	}, nil)
	require.ErrorIs(t, err, ErrUpstreamUnavailable)
	require.NotContains(t, err.Error(), "Authorization")
}

func TestStreamFlushesSSEImmediatelyAndCompletesObserverOnce(t *testing.T) {
	firstFrameWritten := make(chan struct{})
	releaseUpstream := make(chan struct{})
	upstream := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.Header().Set("Content-Type", "text/event-stream")
		response.Header().Set("Set-Cookie", "must-not-leak=true")
		_, _ = response.Write([]byte("data: first\n\n"))
		response.(http.Flusher).Flush()
		close(firstFrameWritten)
		<-releaseUpstream
		_, _ = response.Write([]byte("data: second\n\n"))
	}))
	defer upstream.Close()

	baseURL, err := url.Parse(upstream.URL)
	require.NoError(t, err)
	observer := &recordingObserver{}
	client := NewClient(&fixedSelector{channel: Channel{ID: "stream", Family: "openai", BaseURL: baseURL}}, ClientOptions{})
	gateway := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		upstreamResponse, doErr := client.Do(request.Context(), Request{
			Method: http.MethodGet,
			Family: "openai",
			URL:    &url.URL{Path: "/v1/chat/completions", RawQuery: "stream=true"},
		}, nil)
		require.NoError(t, doErr)
		StreamResponse(request.Context(), response, upstreamResponse, observer)
	}))
	defer gateway.Close()

	response, err := gateway.Client().Get(gateway.URL)
	require.NoError(t, err)
	defer response.Body.Close()
	<-firstFrameWritten

	firstFrame := make(chan string, 1)
	reader := bufio.NewReader(response.Body)
	go func() {
		line1, _ := reader.ReadString('\n')
		line2, _ := reader.ReadString('\n')
		firstFrame <- line1 + line2
	}()
	select {
	case actual := <-firstFrame:
		require.Equal(t, "data: first\n\n", actual)
	case <-time.After(time.Second):
		t.Fatal("first SSE frame was not flushed before the upstream completed")
	}
	require.Empty(t, response.Header.Get("Set-Cookie"))
	close(releaseUpstream)
	rest, err := io.ReadAll(reader)
	require.NoError(t, err)
	require.Equal(t, "data: second\n\n", string(rest))

	require.Eventually(t, func() bool { return observer.completeCount() == 1 }, time.Second, 10*time.Millisecond)
	completion := observer.completion()
	require.True(t, completion.EOF)
	require.NoError(t, completion.Err)
	require.Equal(t, int64(len("data: first\n\ndata: second\n\n")), completion.BytesWritten)
	require.False(t, completion.ClientDisconnected)
	require.Equal(t, 4, observer.observeCount())
}

func TestStreamObservesBytesBeforeWritingDownstream(t *testing.T) {
	response := httptest.NewRecorder()
	observer := &orderingObserver{response: response, observedBeforeWrite: true}
	upstreamResponse := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": {"text/event-stream"}},
		Body:       io.NopCloser(strings.NewReader("data: hello\n\n")),
	}

	completion := StreamResponse(context.Background(), response, upstreamResponse, observer)
	require.True(t, observer.observedBeforeWrite)
	require.Equal(t, 1, observer.completes)
	require.True(t, completion.EOF)
}

func TestStreamFlushesEverySSEFrameFromASingleUpstreamRead(t *testing.T) {
	downstream := &countingFlusher{header: make(http.Header)}
	upstreamResponse := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": {"text/event-stream"}},
		Body:       io.NopCloser(strings.NewReader("data: one\n\ndata: two\n\n")),
	}

	completion := StreamResponse(context.Background(), downstream, upstreamResponse, nil)
	require.True(t, completion.EOF)
	require.Equal(t, 2, downstream.flushes)
	require.Equal(t, "data: one\n\ndata: two\n\n", downstream.body.String())
}

func TestDisconnectDoesNotCancelUpstreamWhenRequestBodyFinishesNormally(t *testing.T) {
	upstreamCanceled := make(chan bool, 1)
	upstream := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		_, err := io.Copy(io.Discard, request.Body)
		require.NoError(t, err)
		select {
		case <-request.Context().Done():
			upstreamCanceled <- true
		case <-time.After(30 * time.Millisecond):
			upstreamCanceled <- false
		}
		response.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	baseURL, err := url.Parse(upstream.URL)
	require.NoError(t, err)
	client := NewClient(&fixedSelector{channel: Channel{ID: "body", Family: "openai", BaseURL: baseURL}}, ClientOptions{})
	response, err := client.Do(context.Background(), Request{
		Method: http.MethodPost,
		Family: "openai",
		URL:    &url.URL{Path: "/v1/chat/completions"},
		Body:   &memoryReplayBody{payload: []byte(`{"stream":true}`)},
	}, nil)
	require.NoError(t, err)
	require.NoError(t, response.Body.Close())
	require.False(t, <-upstreamCanceled)
}

func TestDisconnectCancelsUpstreamOnRequestContextCancellation(t *testing.T) {
	started := make(chan struct{})
	canceled := make(chan struct{})
	upstream := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
		close(started)
		<-request.Context().Done()
		close(canceled)
	}))
	defer upstream.Close()

	baseURL, err := url.Parse(upstream.URL)
	require.NoError(t, err)
	client := NewClient(&fixedSelector{channel: Channel{ID: "cancel", Family: "openai", BaseURL: baseURL}}, ClientOptions{})
	ctx, cancel := context.WithCancel(context.Background())
	result := make(chan error, 1)
	go func() {
		_, doErr := client.Do(ctx, Request{Method: http.MethodGet, Family: "openai", URL: &url.URL{Path: "/v1/models"}}, nil)
		result <- doErr
	}()
	<-started
	cancel()
	require.ErrorIs(t, <-result, ErrUpstreamUnavailable)
	select {
	case <-canceled:
	case <-time.After(time.Second):
		t.Fatal("upstream request context was not canceled")
	}
}

type memoryReplayBody struct {
	mu      sync.Mutex
	payload []byte
	opens   int
}

func (body *memoryReplayBody) Open() (io.ReadCloser, error) {
	body.mu.Lock()
	defer body.mu.Unlock()
	body.opens++
	return io.NopCloser(bytes.NewReader(body.payload)), nil
}

func (body *memoryReplayBody) Size() int64 { return int64(len(body.payload)) }

type fixedSelector struct {
	channel Channel
	err     error
}

func (selector *fixedSelector) Select(context.Context, Request, AttemptHistory) (Channel, error) {
	return selector.channel, selector.err
}

type recordingObserver struct {
	mu          sync.Mutex
	observed    int
	completions []Completion
}

func (observer *recordingObserver) Observe(_ context.Context, _ []byte) {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	observer.observed++
}

func (observer *recordingObserver) Complete(_ context.Context, completion Completion) {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	observer.completions = append(observer.completions, completion)
}

func (observer *recordingObserver) observeCount() int {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	return observer.observed
}

func (observer *recordingObserver) completeCount() int {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	return len(observer.completions)
}

func (observer *recordingObserver) completion() Completion {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	return observer.completions[0]
}

type orderingObserver struct {
	response            *httptest.ResponseRecorder
	observedBeforeWrite bool
	observedBytes       int
	completes           int
}

func (observer *orderingObserver) Observe(_ context.Context, payload []byte) {
	observer.observedBeforeWrite = observer.observedBeforeWrite && observer.response.Body.Len() == observer.observedBytes
	observer.observedBytes += len(payload)
}

func (observer *orderingObserver) Complete(_ context.Context, _ Completion) {
	observer.completes++
}

type countingFlusher struct {
	header  http.Header
	body    bytes.Buffer
	status  int
	flushes int
}

func (writer *countingFlusher) Header() http.Header { return writer.header }

func (writer *countingFlusher) WriteHeader(status int) { writer.status = status }

func (writer *countingFlusher) Write(payload []byte) (int, error) {
	return writer.body.Write(payload)
}

func (writer *countingFlusher) Flush() { writer.flushes++ }
