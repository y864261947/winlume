package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"winlume/services/gateway/internal/config"
)

func TestRouteCatalogUsesSpecificPrecedenceAndAllowedMethods(t *testing.T) {
	testCases := []struct {
		path   string
		method string
		id     string
		family config.ProtocolFamily
	}{
		{path: "/v1/images/generations", method: http.MethodPost, id: "openai-images", family: config.ProtocolImages},
		{path: "/v1/audio/speech", method: http.MethodPost, id: "openai-audio", family: config.ProtocolAudio},
		{path: "/v1/embeddings", method: http.MethodPost, id: "openai-embeddings", family: config.ProtocolEmbeddings},
		{path: "/v1/realtime", method: http.MethodPost, id: "openai-realtime", family: config.ProtocolRealtime},
		{path: "/v1/messages", method: http.MethodPost, id: "claude-messages", family: config.ProtocolClaude},
		{path: "/anthropic/v1/messages", method: http.MethodPost, id: "claude-messages", family: config.ProtocolClaude},
		{path: "/gemini/v1beta/models/gemini-pro:generateContent", method: http.MethodPost, id: "gemini-models", family: config.ProtocolGemini},
		{path: "/api/task/123", method: http.MethodPost, id: "tasks", family: config.ProtocolTask},
		{path: "/mj/submit/imagine", method: http.MethodPost, id: "midjourney", family: config.ProtocolMidjourney},
		{path: "/suno/submit/music", method: http.MethodPost, id: "suno", family: config.ProtocolSuno},
		{path: "/v1/videos/generations", method: http.MethodPost, id: "video", family: config.ProtocolVideo},
		{path: "/v1/chat/completions", method: http.MethodDelete, id: "openai", family: config.ProtocolOpenAI},
	}

	for _, testCase := range testCases {
		t.Run(testCase.id+"_"+testCase.method, func(t *testing.T) {
			route, ok := MatchPublicRoute(testCase.path, testCase.method)
			require.True(t, ok)
			require.Equal(t, testCase.id, route.ID)
			require.Equal(t, testCase.family, route.Family)
		})
	}

	_, ok := MatchPublicRoute("/v1/chat/completions", http.MethodOptions)
	require.False(t, ok)
	_, ok = MatchPublicRoute("/v1/images-unrelated", http.MethodPost)
	require.True(t, ok, "the generic /v1 route should still match")
	_, ok = MatchPublicRoute("/v10/chat/completions", http.MethodPost)
	require.False(t, ok)
}

func TestHealthAliasesAlwaysReportLiveness(t *testing.T) {
	server := NewServer(Dependencies{Config: testConfig(config.BillingShadow)})

	for _, path := range []string{"/health", "/healthz"} {
		t.Run(path, func(t *testing.T) {
			response := serve(server, http.MethodGet, path, nil)
			require.Equal(t, http.StatusOK, response.Code)
			require.NotEmpty(t, response.Header().Get("x-request-id"))
			require.JSONEq(t, `{"status":"ok","service":"winlume-gateway","request_id":"`+response.Header().Get("x-request-id")+`"}`, response.Body.String())
		})
	}
}

func TestReadyAliasesRequireRelayAndBillingDependencies(t *testing.T) {
	configured := testConfig(config.BillingOff)
	configured.Upstreams[config.ProtocolOpenAI] = config.UpstreamConfig{BaseURL: "https://provider.example"}

	testCases := []struct {
		name         string
		dependencies Dependencies
		status       int
		code         string
	}{
		{
			name:         "no configured relay",
			dependencies: Dependencies{Config: testConfig(config.BillingOff)},
			status:       http.StatusServiceUnavailable,
			code:         "no_adapter_configured",
		},
		{
			name:         "relay probe missing",
			dependencies: Dependencies{Config: configured},
			status:       http.StatusServiceUnavailable,
			code:         "relay_not_ready",
		},
		{
			name: "relay probe fails",
			dependencies: Dependencies{
				Config:     configured,
				RelayReady: func(context.Context) error { return errors.New("secret upstream error") },
			},
			status: http.StatusServiceUnavailable,
			code:   "relay_not_ready",
		},
		{
			name: "off mode is ready without billing probe",
			dependencies: Dependencies{
				Config:     configured,
				RelayReady: func(context.Context) error { return nil },
			},
			status: http.StatusOK,
		},
		{
			name: "shadow mode requires billing probe",
			dependencies: Dependencies{
				Config:     withBillingMode(configured, config.BillingShadow),
				RelayReady: func(context.Context) error { return nil },
			},
			status: http.StatusServiceUnavailable,
			code:   "billing_not_ready",
		},
		{
			name: "shadow mode is ready when both probes pass",
			dependencies: Dependencies{
				Config:       withBillingMode(configured, config.BillingShadow),
				RelayReady:   func(context.Context) error { return nil },
				BillingReady: func(context.Context) error { return nil },
			},
			status: http.StatusOK,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			server := NewServer(testCase.dependencies)
			for _, path := range []string{"/ready", "/readyz"} {
				response := serve(server, http.MethodGet, path, nil)
				require.Equal(t, testCase.status, response.Code)
				if testCase.code != "" {
					require.Equal(t, testCase.code, decodeError(t, response).Error.Code)
					require.NotContains(t, response.Body.String(), "secret upstream error")
				}
			}
		})
	}
}

func TestCapabilitiesPublishesConfiguredFamiliesWithoutCredentials(t *testing.T) {
	cfg := testConfig(config.BillingOff)
	cfg.Upstreams[config.ProtocolClaude] = config.UpstreamConfig{
		BaseURL:       "https://claude.example/v1",
		Authorization: "Bearer must-not-leak",
	}
	cfg.Upstreams[config.ProtocolOpenAI] = config.UpstreamConfig{
		BaseURL:       "https://openai.example/v1",
		Authorization: "Bearer also-secret",
	}
	server := NewServer(Dependencies{Config: cfg})

	response := serve(server, http.MethodGet, "/capabilities", nil)
	require.Equal(t, http.StatusOK, response.Code)
	require.NotContains(t, response.Body.String(), "must-not-leak")
	require.NotContains(t, response.Body.String(), "also-secret")
	require.NotContains(t, strings.ToLower(response.Body.String()), "authorization")

	var body CapabilitiesBody
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &body))
	require.Equal(t, []ConfiguredFamily{{Family: config.ProtocolClaude}, {Family: config.ProtocolOpenAI}}, body.Configured)
	require.Len(t, body.Catalog, len(PublicRoutes))
}

func TestCORSUsesAllowlistAndPreflightNeedsNoAuthentication(t *testing.T) {
	cfg := testConfig(config.BillingOff)
	cfg.CORSOrigins = []string{"https://studio.example"}
	server := NewServer(Dependencies{Config: cfg})

	allowed := serveWithHeaders(server, http.MethodOptions, "/v1/chat/completions", nil, map[string]string{
		"Origin":                        "https://studio.example",
		"Access-Control-Request-Method": http.MethodPost,
	})
	require.Equal(t, http.StatusNoContent, allowed.Code)
	require.Equal(t, "https://studio.example", allowed.Header().Get("Access-Control-Allow-Origin"))
	require.Contains(t, allowed.Header().Values("Vary"), "Origin")

	denied := serveWithHeaders(server, http.MethodOptions, "/v1/chat/completions", nil, map[string]string{
		"Origin":                        "https://untrusted.example",
		"Access-Control-Request-Method": http.MethodPost,
	})
	require.Equal(t, http.StatusNoContent, denied.Code)
	require.Empty(t, denied.Header().Get("Access-Control-Allow-Origin"))
	require.Contains(t, denied.Header().Values("Vary"), "Origin")
}

func TestCORSWildcardConfigurationDoesNotAllowArbitraryOrigins(t *testing.T) {
	cfg := testConfig(config.BillingOff)
	cfg.CORSOrigins = []string{"*"}
	server := NewServer(Dependencies{Config: cfg})

	simple := serveWithHeaders(server, http.MethodGet, "/health", nil, map[string]string{
		"Origin": "https://untrusted.example",
	})
	require.Empty(t, simple.Header().Get("Access-Control-Allow-Origin"))
	require.Empty(t, simple.Header().Get("Access-Control-Allow-Credentials"))

	preflight := serveWithHeaders(server, http.MethodOptions, "/v1/chat/completions", nil, map[string]string{
		"Origin":                        "https://untrusted.example",
		"Access-Control-Request-Method": http.MethodPost,
	})
	require.Equal(t, http.StatusNoContent, preflight.Code)
	require.Empty(t, preflight.Header().Get("Access-Control-Allow-Origin"))
	require.Empty(t, preflight.Header().Get("Access-Control-Allow-Credentials"))
	require.Empty(t, preflight.Header().Get("Access-Control-Allow-Methods"))
}

func TestUnconfiguredFamilyReturns501(t *testing.T) {
	server := NewServer(Dependencies{Config: testConfig(config.BillingOff)})
	requestID := "request-12345678"
	response := serveWithHeaders(server, http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"gpt-4o-mini"}`), map[string]string{
		"Authorization": "Bearer wl_test",
		"x-request-id":  requestID,
	})

	require.Equal(t, http.StatusNotImplemented, response.Code)
	require.Equal(t, requestID, response.Header().Get("x-request-id"))
	errorBody := decodeError(t, response)
	require.Equal(t, "capability_error", errorBody.Error.Type)
	require.Equal(t, "protocol_not_configured", errorBody.Error.Code)
	require.Equal(t, requestID, errorBody.RequestID)
}

func TestInvalidRequestIDIsReplacedAndUnknownRoutesUseSafeErrors(t *testing.T) {
	server := NewServer(Dependencies{Config: testConfig(config.BillingOff)})
	response := serveWithHeaders(server, http.MethodGet, "/not-a-route", nil, map[string]string{
		"x-request-id": "bad request id\r\nsecret",
	})

	require.Equal(t, http.StatusNotFound, response.Code)
	requestID := response.Header().Get("x-request-id")
	require.Regexp(t, `^[0-9a-f-]{36}$`, requestID)
	require.Equal(t, requestID, decodeError(t, response).RequestID)
	require.NotContains(t, response.Body.String(), "secret")
}

func TestPublicRoutesRejectUnsupportedMethods(t *testing.T) {
	server := NewServer(Dependencies{Config: testConfig(config.BillingOff)})
	response := serve(server, http.MethodTrace, "/v1/chat/completions", nil)

	require.Equal(t, http.StatusMethodNotAllowed, response.Code)
	require.Equal(t, "method_not_allowed", decodeError(t, response).Error.Code)
}

func TestOperationalRoutesAllowOnlyGet(t *testing.T) {
	server := NewServer(Dependencies{Config: testConfig(config.BillingOff)})

	for _, path := range []string{"/health", "/healthz", "/ready", "/readyz", "/capabilities"} {
		t.Run(path, func(t *testing.T) {
			response := serve(server, http.MethodPost, path, nil)
			require.Equal(t, http.StatusMethodNotAllowed, response.Code)
			require.Equal(t, http.MethodGet, response.Header().Get("Allow"))
		})
	}
}

func TestMetricsRouteRequiresInternalTokenAndIsNeverPublic(t *testing.T) {
	cfg := testConfig(config.BillingOff)
	cfg.InternalToken = "internal-secret"
	metricsBody := "gateway_requests_total 1\n"
	server := NewServer(Dependencies{
		Config:         cfg,
		MetricsHandler: http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) { _, _ = response.Write([]byte(metricsBody)) }),
	})

	unauthorized := serve(server, http.MethodGet, "/metrics", nil)
	require.Equal(t, http.StatusUnauthorized, unauthorized.Code)
	require.Equal(t, "internal_token_required", decodeError(t, unauthorized).Error.Code)

	authorized := serveWithHeaders(server, http.MethodGet, "/metrics", nil, map[string]string{"x-winlume-internal-token": "internal-secret"})
	require.Equal(t, http.StatusOK, authorized.Code)
	require.Equal(t, metricsBody, authorized.Body.String())

	notAllowed := serveWithHeaders(server, http.MethodPost, "/metrics", nil, map[string]string{"x-winlume-internal-token": "internal-secret"})
	require.Equal(t, http.StatusMethodNotAllowed, notAllowed.Code)
}

func TestMetricsRouteWithoutHandlerConfiguredReturns503(t *testing.T) {
	cfg := testConfig(config.BillingOff)
	cfg.InternalToken = "internal-secret"
	server := NewServer(Dependencies{Config: cfg})

	response := serveWithHeaders(server, http.MethodGet, "/metrics", nil, map[string]string{"x-winlume-internal-token": "internal-secret"})
	require.Equal(t, http.StatusServiceUnavailable, response.Code)
	require.Equal(t, "metrics_unavailable", decodeError(t, response).Error.Code)
}

func TestAdminRoutesRequireAdminToken(t *testing.T) {
	cfg := testConfig(config.BillingShadow)
	cfg.GatewayAdminToken = "admin-secret"
	server := NewServer(Dependencies{
		Config:       cfg,
		AdminHandler: http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }),
	})

	unauthorized := serve(server, http.MethodGet, "/internal/admin/service-accounts", nil)
	require.Equal(t, http.StatusUnauthorized, unauthorized.Code)

	authorized := serveWithHeaders(server, http.MethodGet, "/internal/admin/service-accounts", nil, map[string]string{"x-winlume-gateway-admin-token": "admin-secret"})
	require.Equal(t, http.StatusOK, authorized.Code)
}

func testConfig(mode config.BillingMode) config.Config {
	return config.Config{
		BillingMode: mode,
		Upstreams:   make(map[config.ProtocolFamily]config.UpstreamConfig),
	}
}

func withBillingMode(cfg config.Config, mode config.BillingMode) config.Config {
	cfg.BillingMode = mode
	return cfg
}

func serve(handler http.Handler, method, target string, body *strings.Reader) *httptest.ResponseRecorder {
	return serveWithHeaders(handler, method, target, body, nil)
}

func serveWithHeaders(handler http.Handler, method, target string, body *strings.Reader, headers map[string]string) *httptest.ResponseRecorder {
	var request *http.Request
	if body == nil {
		request = httptest.NewRequest(method, target, nil)
	} else {
		request = httptest.NewRequest(method, target, body)
	}
	for name, value := range headers {
		request.Header.Set(name, value)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func decodeError(t *testing.T, response *httptest.ResponseRecorder) ErrorBody {
	t.Helper()
	var body ErrorBody
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &body))
	return body
}
