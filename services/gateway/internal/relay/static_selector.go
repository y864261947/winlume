package relay

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"winlume/services/gateway/internal/config"
)

var (
	ErrNoChannel        = errors.New("no relay channel configured")
	authorizationScheme = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9-]*\s+`)
)

// StaticSelector maps every configured protocol family to one environment
// backed channel.
type StaticSelector struct {
	channels map[string]Channel
}

func NewStaticSelector(upstreams map[config.ProtocolFamily]config.UpstreamConfig) (*StaticSelector, error) {
	selector := &StaticSelector{channels: make(map[string]Channel, len(upstreams))}
	for family, upstream := range upstreams {
		baseURL, err := url.Parse(upstream.BaseURL)
		if err != nil || baseURL.Scheme == "" || baseURL.Host == "" {
			return nil, fmt.Errorf("parse %s upstream URL", family)
		}
		selector.channels[string(family)] = Channel{
			ID:            string(family) + "-environment",
			Family:        string(family),
			BaseURL:       cloneURL(baseURL),
			Authorization: normalizeAuthorization(upstream.Authorization),
			Headers:       make(http.Header),
		}
	}
	return selector, nil
}

func (selector *StaticSelector) Select(_ context.Context, request Request, _ AttemptHistory) (Channel, error) {
	if selector == nil {
		return Channel{}, ErrNoChannel
	}
	channel, ok := selector.channels[request.Family]
	if !ok {
		return Channel{}, ErrNoChannel
	}
	channel.BaseURL = cloneURL(channel.BaseURL)
	channel.Headers = channel.Headers.Clone()
	return channel, nil
}

func normalizeAuthorization(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || authorizationScheme.MatchString(value) {
		return value
	}
	return "Bearer " + value
}

func cloneURL(source *url.URL) *url.URL {
	if source == nil {
		return nil
	}
	clone := *source
	return &clone
}
