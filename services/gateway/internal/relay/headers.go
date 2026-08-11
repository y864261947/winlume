package relay

import (
	"net/http"
	"strings"

	"github.com/google/uuid"
)

const maxForwardedHeaderValueBytes = 16 * 1024

var hopByHopHeaders = headerSet(
	"connection",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
)

var requestBlockedHeaders = mergedHeaderSet(hopByHopHeaders,
	"authorization",
	"cookie",
	"set-cookie",
	"proxy-connection",
	"host",
	"content-length",
	"accept-encoding",
	"x-api-key",
	"api-key",
	"new-api-user",
	"x-reizo-user",
	"x-reizo-user-id",
	"x-reizo-internal-token",
	"x-reizo-internal-user-id",
	"x-reizo-internal-identity",
	"x-reizo-internal-user",
	"forwarded",
	"via",
	"origin",
	"referer",
)

var responseBlockedHeaders = mergedHeaderSet(hopByHopHeaders,
	"set-cookie",
	"content-length",
	"content-encoding",
	"x-request-id",
)

// RequestHeaderOptions contains only server-controlled header additions.
type RequestHeaderOptions struct {
	Authorization              string
	TrustedUserID              *uuid.UUID
	IncludeNewAPICompatibility bool
}

// FilterRequestHeaders removes caller-controlled credentials, identity,
// forwarding, and connection-scoped values before relay.
func FilterRequestHeaders(source http.Header) http.Header {
	return filterHeaders(source, requestBlockedHeaders)
}

// FilterResponseHeaders removes transport and credential-bearing values that
// must not cross the Gateway response boundary.
func FilterResponseHeaders(source http.Header) http.Header {
	return filterHeaders(source, responseBlockedHeaders)
}

// BuildRequestHeaders filters caller input before adding trusted upstream
// credentials and the optional new-api compatibility identity.
func BuildRequestHeaders(source http.Header, options RequestHeaderOptions) http.Header {
	result := FilterRequestHeaders(source)
	if options.Authorization != "" && safeHeaderValue(options.Authorization) {
		result.Set("Authorization", options.Authorization)
	}
	if options.IncludeNewAPICompatibility && options.TrustedUserID != nil && *options.TrustedUserID != uuid.Nil {
		result.Set("new-api-user", options.TrustedUserID.String())
	}
	return result
}

func filterHeaders(source http.Header, blocked map[string]struct{}) http.Header {
	result := make(http.Header)
	connectionScoped := connectionScopedHeaders(source)
	for name, values := range source {
		normalizedName := strings.ToLower(name)
		if isBlockedHeader(normalizedName, blocked, connectionScoped) {
			continue
		}
		for _, value := range values {
			if safeHeaderValue(value) {
				result.Add(name, value)
			}
		}
	}
	return result
}

func connectionScopedHeaders(headers http.Header) map[string]struct{} {
	result := make(map[string]struct{})
	for headerName, values := range headers {
		if !strings.EqualFold(headerName, "connection") {
			continue
		}
		for _, value := range values {
			for _, name := range strings.Split(value, ",") {
				if name = strings.ToLower(strings.TrimSpace(name)); name != "" {
					result[name] = struct{}{}
				}
			}
		}
	}
	return result
}

func isBlockedHeader(name string, blocked, connectionScoped map[string]struct{}) bool {
	if _, ok := blocked[name]; ok {
		return true
	}
	if _, ok := connectionScoped[name]; ok {
		return true
	}
	return strings.HasPrefix(name, "x-forwarded-") || strings.HasPrefix(name, "x-reizo-internal-")
}

func safeHeaderValue(value string) bool {
	return len(value) <= maxForwardedHeaderValueBytes && !strings.ContainsAny(value, "\r\n")
}

func headerSet(names ...string) map[string]struct{} {
	result := make(map[string]struct{}, len(names))
	for _, name := range names {
		result[name] = struct{}{}
	}
	return result
}

func mergedHeaderSet(base map[string]struct{}, names ...string) map[string]struct{} {
	result := make(map[string]struct{}, len(base)+len(names))
	for name := range base {
		result[name] = struct{}{}
	}
	for _, name := range names {
		result[name] = struct{}{}
	}
	return result
}
