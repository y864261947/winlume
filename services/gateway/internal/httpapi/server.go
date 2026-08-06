package httpapi

import (
	"context"
	"crypto/subtle"
	"net/http"
	"regexp"
	"strings"

	"github.com/google/uuid"

	"winlume/services/gateway/internal/config"
)

type requestIDContextKey struct{}

var validRequestID = regexp.MustCompile(`^[A-Za-z0-9._-]{8,128}$`)

// ReadinessProbe returns nil only when one server dependency is ready.
type ReadinessProbe func(context.Context) error

// PublicHandler is the handoff seam used by identity and relay tasks after the
// route catalog has selected a protocol family.
type PublicHandler func(http.ResponseWriter, *http.Request, Route)

// Dependencies contains only the collaborators needed by the HTTP shell.
type Dependencies struct {
	Config          config.Config
	RelayReady      ReadinessProbe
	BillingReady    ReadinessProbe
	PublicHandler   PublicHandler
	InternalHandler http.Handler
	// AdminHandler serves /internal/admin/*. Like InternalHandler it is only
	// ever reachable behind its own token check (authorizeAdmin), never on
	// the unauthenticated public route surface.
	AdminHandler http.Handler
	// MetricsHandler serves the Prometheus scrape endpoint. Like
	// InternalHandler, it is only ever reachable behind the internal token
	// check - never on the unauthenticated public route surface - so a
	// bounded-cardinality metric page is never exposed to arbitrary callers.
	MetricsHandler http.Handler
}

// Server owns the public HTTP contract without owning authentication, relay, or
// billing implementation details.
type Server struct {
	config          config.Config
	relayReady      ReadinessProbe
	billingReady    ReadinessProbe
	publicHandler   PublicHandler
	internalHandler http.Handler
	adminHandler    http.Handler
	metricsHandler  http.Handler
	handler         http.Handler
}

type healthBody struct {
	Status    string `json:"status"`
	Service   string `json:"service"`
	RequestID string `json:"request_id"`
}

// ConfiguredFamily is the credential-free capabilities representation.
type ConfiguredFamily struct {
	Family config.ProtocolFamily `json:"family"`
}

// CapabilitiesBody exposes configured protocol IDs and the static route
// catalog. It deliberately contains no upstream URLs or credentials.
type CapabilitiesBody struct {
	Configured []ConfiguredFamily `json:"configured"`
	Catalog    []Route            `json:"catalog"`
	RequestID  string             `json:"request_id"`
}

type readinessBody struct {
	Status    string             `json:"status"`
	Service   string             `json:"service"`
	Adapters  []ConfiguredFamily `json:"adapters"`
	RequestID string             `json:"request_id"`
}

// NewServer creates the Fastify-compatible operational and public route shell.
func NewServer(dependencies Dependencies) *Server {
	server := &Server{
		config:          dependencies.Config,
		relayReady:      dependencies.RelayReady,
		billingReady:    dependencies.BillingReady,
		publicHandler:   dependencies.PublicHandler,
		internalHandler: dependencies.InternalHandler,
		adminHandler:    dependencies.AdminHandler,
		metricsHandler:  dependencies.MetricsHandler,
	}
	server.handler = withRequestID(withCORS(http.HandlerFunc(server.serveHTTP), dependencies.Config.CORSOrigins))
	return server
}

func (server *Server) ServeHTTP(response http.ResponseWriter, request *http.Request) {
	server.handler.ServeHTTP(response, request)
}

func (server *Server) serveHTTP(response http.ResponseWriter, request *http.Request) {
	switch request.URL.Path {
	case "/health", "/healthz":
		if request.Method != http.MethodGet {
			server.writeMethodNotAllowed(response, request, http.MethodGet)
			return
		}
		server.writeHealth(response, request)
		return
	case "/ready", "/readyz":
		if request.Method != http.MethodGet {
			server.writeMethodNotAllowed(response, request, http.MethodGet)
			return
		}
		server.writeReadiness(response, request)
		return
	case "/capabilities":
		if request.Method != http.MethodGet {
			server.writeMethodNotAllowed(response, request, http.MethodGet)
			return
		}
		server.writeCapabilities(response, request)
		return
	case "/internal/billing/shadow-events":
		if request.Method != http.MethodGet {
			server.writeMethodNotAllowed(response, request, http.MethodGet)
			return
		}
		if !server.authorizeInternal(request) {
			writeError(response, http.StatusUnauthorized, "authentication_error", "internal_token_required", "A valid internal token is required", requestID(request))
			return
		}
		if server.internalHandler == nil {
			writeError(response, http.StatusServiceUnavailable, "billing_error", "shadow_events_unavailable", "Shadow billing is not configured", requestID(request))
			return
		}
		server.internalHandler.ServeHTTP(response, request)
		return
	case "/metrics":
		if request.Method != http.MethodGet {
			server.writeMethodNotAllowed(response, request, http.MethodGet)
			return
		}
		if !server.authorizeInternal(request) {
			writeError(response, http.StatusUnauthorized, "authentication_error", "internal_token_required", "A valid internal token is required", requestID(request))
			return
		}
		if server.metricsHandler == nil {
			writeError(response, http.StatusServiceUnavailable, "observability_error", "metrics_unavailable", "Metrics are not configured", requestID(request))
			return
		}
		server.metricsHandler.ServeHTTP(response, request)
		return
	}

	if strings.HasPrefix(request.URL.Path, "/internal/admin/") {
		if !server.authorizeAdmin(request) {
			writeError(response, http.StatusUnauthorized, "authentication_error", "admin_token_required", "A valid admin token is required", requestID(request))
			return
		}
		if server.adminHandler == nil {
			writeError(response, http.StatusServiceUnavailable, "admin_error", "admin_api_unavailable", "The admin API is not configured", requestID(request))
			return
		}
		server.adminHandler.ServeHTTP(response, request)
		return
	}

	route, pathKnown := matchPublicPath(request.URL.Path)
	if !pathKnown {
		writeError(response, http.StatusNotFound, "not_found", "route_not_found", "The requested API route does not exist", requestID(request))
		return
	}
	if !methodAllowed(request.Method) {
		server.writeMethodNotAllowed(response, request, allowedPublicMethodsHeader)
		return
	}
	if _, configured := server.config.Upstreams[route.Family]; !configured {
		writeError(
			response,
			http.StatusNotImplemented,
			"capability_error",
			"protocol_not_configured",
			"No upstream is configured for the requested protocol family",
			requestID(request),
		)
		return
	}
	if server.publicHandler == nil {
		writeError(response, http.StatusServiceUnavailable, "relay_error", "relay_not_ready", "The configured relay is not ready", requestID(request))
		return
	}
	server.publicHandler(response, request, route)
}

func (server *Server) authorizeInternal(request *http.Request) bool {
	expected := []byte(server.config.InternalToken)
	received := []byte(request.Header.Get("x-winlume-internal-token"))
	return len(expected) > 0 && len(expected) == len(received) && subtle.ConstantTimeCompare(expected, received) == 1
}

func (server *Server) authorizeAdmin(request *http.Request) bool {
	expected := []byte(server.config.GatewayAdminToken)
	received := []byte(request.Header.Get("x-winlume-gateway-admin-token"))
	return len(expected) > 0 && len(expected) == len(received) && subtle.ConstantTimeCompare(expected, received) == 1
}

func (server *Server) writeHealth(response http.ResponseWriter, request *http.Request) {
	writeJSON(response, http.StatusOK, healthBody{
		Status:    "ok",
		Service:   "winlume-gateway",
		RequestID: requestID(request),
	})
}

func (server *Server) writeReadiness(response http.ResponseWriter, request *http.Request) {
	configured := server.configuredFamilies()
	if len(configured) == 0 {
		writeError(response, http.StatusServiceUnavailable, "readiness_error", "no_adapter_configured", "No upstream adapter is configured", requestID(request))
		return
	}
	if server.relayReady == nil || server.relayReady(request.Context()) != nil {
		writeError(response, http.StatusServiceUnavailable, "readiness_error", "relay_not_ready", "The configured relay is not ready", requestID(request))
		return
	}
	if server.config.BillingMode != config.BillingOff {
		if server.billingReady == nil || server.billingReady(request.Context()) != nil {
			writeError(response, http.StatusServiceUnavailable, "readiness_error", "billing_not_ready", "The billing dependency is not ready", requestID(request))
			return
		}
	}
	writeJSON(response, http.StatusOK, readinessBody{
		Status:    "ready",
		Service:   "winlume-gateway",
		Adapters:  configured,
		RequestID: requestID(request),
	})
}

func (server *Server) writeCapabilities(response http.ResponseWriter, request *http.Request) {
	writeJSON(response, http.StatusOK, CapabilitiesBody{
		Configured: server.configuredFamilies(),
		Catalog:    PublicRoutes,
		RequestID:  requestID(request),
	})
}

func (server *Server) writeMethodNotAllowed(response http.ResponseWriter, request *http.Request, allow string) {
	response.Header().Set("Allow", allow)
	writeError(response, http.StatusMethodNotAllowed, "request_error", "method_not_allowed", "The requested HTTP method is not allowed", requestID(request))
}

func (server *Server) configuredFamilies() []ConfiguredFamily {
	configured := make([]ConfiguredFamily, 0, len(server.config.Upstreams))
	seen := make(map[config.ProtocolFamily]struct{}, len(server.config.Upstreams))
	for _, route := range PublicRoutes {
		if _, ok := server.config.Upstreams[route.Family]; !ok {
			continue
		}
		if _, ok := seen[route.Family]; ok {
			continue
		}
		seen[route.Family] = struct{}{}
		configured = append(configured, ConfiguredFamily{Family: route.Family})
	}
	return configured
}

func withRequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		candidate := request.Header.Get("x-request-id")
		if !validRequestID.MatchString(candidate) {
			candidate = uuid.NewString()
		}
		response.Header().Set("x-request-id", candidate)
		request = request.WithContext(context.WithValue(request.Context(), requestIDContextKey{}, candidate))
		next.ServeHTTP(response, request)
	})
}

func requestID(request *http.Request) string {
	value, _ := request.Context().Value(requestIDContextKey{}).(string)
	return value
}
