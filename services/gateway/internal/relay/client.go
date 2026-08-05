package relay

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptrace"
	"net/url"
	"strings"
	"time"
)

var ErrUpstreamUnavailable = errors.New("upstream unavailable")

var sharedTransport = &http.Transport{
	Proxy:                 http.ProxyFromEnvironment,
	DialContext:           (&net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
	ForceAttemptHTTP2:     true,
	MaxIdleConns:          200,
	MaxIdleConnsPerHost:   50,
	IdleConnTimeout:       90 * time.Second,
	TLSHandshakeTimeout:   10 * time.Second,
	ExpectContinueTimeout: time.Second,
	ResponseHeaderTimeout: 60 * time.Second,
}

type ClientOptions struct {
	HTTPClient *http.Client
}

// Client performs one selected relay attempt. Retry policy remains outside it.
type Client struct {
	selector   ChannelSelector
	httpClient *http.Client
}

func NewClient(selector ChannelSelector, options ClientOptions) *Client {
	configured := http.Client{Transport: sharedTransport}
	if options.HTTPClient != nil {
		configured = *options.HTTPClient
	}
	configured.CheckRedirect = func(_ *http.Request, _ []*http.Request) error {
		return http.ErrUseLastResponse
	}
	return &Client{selector: selector, httpClient: &configured}
}

// Do selects one channel, reopens the body, and starts the upstream response.
// It performs exactly one relay attempt; callers that need retry behavior
// across multiple attempts use Relay instead.
func (client *Client) Do(ctx context.Context, request Request, history AttemptHistory) (*http.Response, error) {
	channel, err := client.selectChannel(ctx, request, history)
	if err != nil {
		return nil, err
	}
	response, _, err := client.relayAttempt(ctx, request, channel)
	return response, err
}

// selectChannel asks the configured selector for one destination, filtering
// caller headers before the selector ever sees them.
func (client *Client) selectChannel(ctx context.Context, request Request, history AttemptHistory) (Channel, error) {
	if client == nil || client.selector == nil || request.URL == nil {
		return Channel{}, ErrNoChannel
	}
	selectionRequest := request
	selectionRequest.Headers = FilterRequestHeaders(request.Headers)
	channel, err := client.selector.Select(ctx, selectionRequest, history)
	if err != nil {
		return Channel{}, err
	}
	if channel.BaseURL == nil {
		return Channel{}, ErrNoChannel
	}
	return channel, nil
}

// relayAttempt builds and executes one upstream request against an
// already-selected channel. The returned bool reports whether the outgoing
// request was fully written to the upstream connection before any error:
// retry classification uses it to tell "the upstream never saw this request"
// apart from "upstream acceptance is uncertain".
func (client *Client) relayAttempt(ctx context.Context, request Request, channel Channel) (*http.Response, bool, error) {
	target := JoinUpstreamURL(channel.BaseURL, request.URL)
	var body io.ReadCloser
	var err error
	if request.Body != nil && !strings.EqualFold(request.Method, http.MethodGet) && !strings.EqualFold(request.Method, http.MethodHead) {
		body, err = request.Body.Open()
		if err != nil {
			return nil, false, fmt.Errorf("open relay request body: %w", err)
		}
	}

	wrote := false
	trace := &httptrace.ClientTrace{
		WroteRequest: func(info httptrace.WroteRequestInfo) { wrote = info.Err == nil },
	}
	tracedCtx := httptrace.WithClientTrace(ctx, trace)

	upstreamRequest, err := http.NewRequestWithContext(tracedCtx, request.Method, target.String(), body)
	if err != nil {
		if body != nil {
			_ = body.Close()
		}
		return nil, false, fmt.Errorf("build upstream request: %w", err)
	}
	upstreamRequest.Host = target.Host
	upstreamRequest.Header = BuildRequestHeaders(request.Headers, RequestHeaderOptions{
		Authorization:              channel.Authorization,
		TrustedUserID:              request.TrustedUserID,
		IncludeNewAPICompatibility: request.IncludeNewAPICompatibility,
	})
	for name, values := range FilterRequestHeaders(channel.Headers) {
		upstreamRequest.Header.Del(name)
		for _, value := range values {
			upstreamRequest.Header.Add(name, value)
		}
	}
	if request.RequestID != "" {
		upstreamRequest.Header.Set("x-request-id", request.RequestID)
	}
	if body != nil {
		upstreamRequest.ContentLength = request.Body.Size()
	}

	response, err := client.httpClient.Do(upstreamRequest)
	if err != nil {
		return nil, wrote, fmt.Errorf("%w: %T", ErrUpstreamUnavailable, err)
	}
	return response, true, nil
}

// JoinUpstreamURL preserves the configured origin and the incoming raw query.
func JoinUpstreamURL(base, incoming *url.URL) *url.URL {
	result := *base
	basePath := strings.TrimRight(result.Path, "/")
	if basePath == "" {
		basePath = "/"
	}
	incomingPath := incoming.Path
	if incomingPath == "" {
		incomingPath = "/"
	}

	switch {
	case basePath == "/":
		result.Path = incomingPath
	case incomingPath == basePath || strings.HasPrefix(incomingPath, basePath+"/"):
		result.Path = incomingPath
	case strings.HasSuffix(basePath, "/v1") && strings.HasPrefix(incomingPath, "/v1/"):
		result.Path = basePath + incomingPath[3:]
	default:
		result.Path = basePath + "/" + strings.TrimLeft(incomingPath, "/")
	}
	result.RawPath = ""
	result.RawQuery = incoming.RawQuery
	result.ForceQuery = incoming.ForceQuery
	result.Fragment = ""
	return &result
}
