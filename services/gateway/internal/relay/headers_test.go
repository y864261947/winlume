package relay

import (
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestHeadersFilterCallerControlledSensitiveRequestValues(t *testing.T) {
	headers := http.Header{
		"Authorization":                     {"Bearer caller-key"},
		"Cookie":                            {"session=secret"},
		"Set-Cookie":                        {"must-not-forward=true"},
		"Host":                              {"caller.example"},
		"Content-Length":                    {"123"},
		"Accept-Encoding":                   {"br"},
		"X-Api-Key":                         {"caller-key"},
		"Api-Key":                           {"caller-legacy-key"},
		"New-Api-User":                      {"browser-spoof"},
		"X-Winlume-User":                    {"browser-spoof"},
		"X-Winlume-User-Id":                 {"browser-spoof"},
		"X-Winlume-Internal-Token":          {"internal-secret"},
		"X-Winlume-Internal-Custom":         {"internal-secret"},
		"X-Forwarded-For":                   {"198.51.100.10"},
		"Forwarded":                         {"for=198.51.100.10"},
		"Via":                               {"proxy"},
		"Origin":                            {"https://caller.example"},
		"Referer":                           {"https://caller.example/page"},
		"Connection":                        {"x-hop-by-hop, keep-alive"},
		"X-Hop-By-Hop":                      {"must-not-forward"},
		"connection":                        {"x-lowercase-hop"},
		"x-lowercase-hop":                   {"must-not-forward"},
		"Keep-Alive":                        {"timeout=5"},
		"X-Unsafe-Newline":                  {"safe", "bad\r\nvalue"},
		"X-Oversized":                       {strings.Repeat("x", 16*1024+1)},
		"Content-Type":                      {"application/json"},
		"Accept":                            {"text/event-stream"},
		"X-Request-Id":                      {"request-12345678"},
		"X-Preserved-Multiple-Value-Header": {"one", "two"},
		"X-Empty-But-Valid":                 {""},
	}

	filtered := FilterRequestHeaders(headers)
	require.Equal(t, []string{"application/json"}, filtered.Values("Content-Type"))
	require.Equal(t, []string{"text/event-stream"}, filtered.Values("Accept"))
	require.Equal(t, []string{"request-12345678"}, filtered.Values("X-Request-Id"))
	require.Equal(t, []string{"one", "two"}, filtered.Values("X-Preserved-Multiple-Value-Header"))
	require.Equal(t, []string{""}, filtered.Values("X-Empty-But-Valid"))
	require.Equal(t, []string{"safe"}, filtered.Values("X-Unsafe-Newline"))

	for _, name := range []string{
		"Authorization", "Cookie", "Set-Cookie", "Host", "Content-Length", "Accept-Encoding",
		"X-Api-Key", "Api-Key", "New-Api-User", "X-Winlume-User",
		"X-Winlume-User-Id", "X-Winlume-Internal-Token", "X-Winlume-Internal-Custom",
		"X-Forwarded-For", "Forwarded", "Via", "Origin", "Referer", "Connection",
		"X-Hop-By-Hop", "X-Lowercase-Hop", "Keep-Alive", "X-Oversized",
	} {
		require.Empty(t, filtered.Values(name), name)
	}
}

func TestHeadersInjectOnlyConfiguredAuthorizationAndValidatedIdentity(t *testing.T) {
	validatedUserID := uuid.New()
	incoming := http.Header{
		"Authorization": {"Bearer caller-key"},
		"New-Api-User":  {"browser-spoof"},
		"Content-Type":  {"application/json"},
	}

	withoutCompatibility := BuildRequestHeaders(incoming, RequestHeaderOptions{
		Authorization: "Bearer upstream-service-token",
		TrustedUserID: &validatedUserID,
	})
	require.Equal(t, "Bearer upstream-service-token", withoutCompatibility.Get("Authorization"))
	require.Empty(t, withoutCompatibility.Get("New-Api-User"))

	withCompatibility := BuildRequestHeaders(incoming, RequestHeaderOptions{
		Authorization:              "Bearer upstream-service-token",
		TrustedUserID:              &validatedUserID,
		IncludeNewAPICompatibility: true,
	})
	require.Equal(t, validatedUserID.String(), withCompatibility.Get("New-Api-User"))
	require.NotEqual(t, "browser-spoof", withCompatibility.Get("New-Api-User"))
}

func TestHeadersFilterSensitiveUpstreamResponseValues(t *testing.T) {
	headers := http.Header{
		"Content-Type":     {"text/event-stream"},
		"X-Upstream-Id":    {"upstream-1"},
		"Retry-After":      {"3"},
		"Set-Cookie":       {"must-not-leak=true"},
		"Content-Length":   {"123"},
		"Content-Encoding": {"gzip"},
		"X-Request-Id":     {"upstream-attempt-id"},
		"Connection":       {"x-hop-response"},
		"X-Hop-Response":   {"hidden"},
		"X-Unsafe":         {"bad\nvalue"},
	}

	filtered := FilterResponseHeaders(headers)
	require.Equal(t, "text/event-stream", filtered.Get("Content-Type"))
	require.Equal(t, "upstream-1", filtered.Get("X-Upstream-Id"))
	require.Equal(t, "3", filtered.Get("Retry-After"))
	for _, name := range []string{"Set-Cookie", "Content-Length", "Content-Encoding", "X-Request-Id", "Connection", "X-Hop-Response", "X-Unsafe"} {
		require.Empty(t, filtered.Get(name), name)
	}
}
