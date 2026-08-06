package httpapi

import (
	"net/http"
	"strings"
)

var corsAllowedHeaders = []string{
	"authorization",
	"content-type",
	"x-api-key",
	"x-request-id",
}

func withCORS(next http.Handler, allowedOrigins []string) http.Handler {
	origins := make(map[string]struct{}, len(allowedOrigins))
	for _, origin := range allowedOrigins {
		if origin == "*" {
			continue
		}
		origins[origin] = struct{}{}
	}

	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		appendVary(response.Header(), "Origin")
		origin := request.Header.Get("Origin")
		_, explicitlyAllowed := origins[origin]
		originAllowed := origin != "" && explicitlyAllowed
		requestedMethod := request.Header.Get("Access-Control-Request-Method")
		isPreflight := request.Method == http.MethodOptions && requestedMethod != ""

		if originAllowed && (!isPreflight || methodAllowed(requestedMethod)) {
			response.Header().Set("Access-Control-Allow-Origin", origin)
			response.Header().Set("Access-Control-Allow-Credentials", "true")
			response.Header().Set("Access-Control-Expose-Headers", "x-request-id")
		}
		if isPreflight {
			if originAllowed && methodAllowed(requestedMethod) {
				response.Header().Set("Access-Control-Allow-Methods", strings.Join(append(append([]string(nil), allowedPublicMethods...), http.MethodOptions), ", "))
				response.Header().Set("Access-Control-Allow-Headers", strings.Join(corsAllowedHeaders, ", "))
			}
			response.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(response, request)
	})
}

func appendVary(header http.Header, value string) {
	for _, existing := range header.Values("Vary") {
		for _, item := range strings.Split(existing, ",") {
			if strings.EqualFold(strings.TrimSpace(item), value) {
				return
			}
		}
	}
	header.Add("Vary", value)
}
