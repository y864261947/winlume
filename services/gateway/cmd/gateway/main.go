package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/google/uuid"

	"winlume/services/gateway/internal/billing"
	"winlume/services/gateway/internal/config"
	"winlume/services/gateway/internal/httpapi"
	"winlume/services/gateway/internal/identity"
	"winlume/services/gateway/internal/observability"
	"winlume/services/gateway/internal/pricing"
	"winlume/services/gateway/internal/relay"
	"winlume/services/gateway/internal/storage"
	"winlume/services/gateway/internal/usage"
)

const shutdownTimeout = 15 * time.Second

var errAPIKeyVerificationUnavailable = errors.New("API key verification unavailable")

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	os.Exit(execute(ctx, config.Load, net.Listen, os.Stderr))
}

func execute(
	ctx context.Context,
	loadConfig func() (config.Config, error),
	listen func(string, string) (net.Listener, error),
	stderr io.Writer,
) int {
	cfg, err := loadConfig()
	if err == nil {
		err = cfg.Validate()
	}
	if err != nil {
		_, _ = fmt.Fprintf(stderr, "gateway configuration is invalid: %v\n", err)
		return 1
	}

	listener, err := listen("tcp", net.JoinHostPort(cfg.Host, strconv.Itoa(cfg.Port)))
	if err != nil {
		_, _ = fmt.Fprintln(stderr, "gateway listener could not start")
		return 1
	}
	if err = run(ctx, cfg, listener); err != nil {
		_, _ = fmt.Fprintf(stderr, "gateway stopped with error: %v\n", err)
		return 1
	}
	return 0
}

func run(ctx context.Context, cfg config.Config, listener net.Listener) error {
	if err := cfg.Validate(); err != nil {
		_ = listener.Close()
		return err
	}
	selector, err := relay.NewStaticSelector(cfg.Upstreams)
	if err != nil {
		_ = listener.Close()
		return err
	}
	logger := observability.NewLogger(os.Stdout)
	relayClient := relay.NewClient(selector, relay.ClientOptions{})
	var lookup identity.APIKeyLookup = configuredAPIKeyLookup{hashes: cfg.APIKeyHashes, allowUnverified: cfg.AllowUnverifiedAPIKeys}
	var shadow *billing.Service
	var billingReady httpapi.ReadinessProbe
	var internalHandler http.Handler
	if cfg.BillingMode == config.BillingShadow {
		store, storageErr := storage.Open(ctx, cfg.DatabaseURL)
		if storageErr != nil {
			_ = listener.Close()
			return storageErr
		}
		defer store.Close()
		lookup = store
		shadow = billing.NewShadowService(store, store)
		internalHandler = shadowEventsHandler(store)
		billingReady = func(probeCtx context.Context) error {
			if err := store.Health(probeCtx); err != nil {
				return err
			}
			_, err := store.LoadActiveCatalog(probeCtx)
			return err
		}
	}

	serverHandler := httpapi.NewServer(httpapi.Dependencies{
		Config: cfg,
		RelayReady: func(probeCtx context.Context) error {
			for family := range cfg.Upstreams {
				_, selectErr := selector.Select(probeCtx, relay.Request{Family: string(family)}, nil)
				return selectErr
			}
			return relay.ErrNoChannel
		},
		BillingReady:    billingReady,
		InternalHandler: internalHandler,
		PublicHandler: func(response http.ResponseWriter, request *http.Request, route httpapi.Route) {
			handlePublicRequest(response, request, route, cfg, lookup, shadow, relayClient, logger)
		},
	})
	httpServer := &http.Server{
		Handler:           serverHandler,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       2 * time.Minute,
	}

	serveResult := make(chan error, 1)
	go func() {
		serveResult <- httpServer.Serve(listener)
	}()

	select {
	case serveErr := <-serveResult:
		if errors.Is(serveErr, http.ErrServerClosed) {
			return nil
		}
		return serveErr
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		if shutdownErr := httpServer.Shutdown(shutdownCtx); shutdownErr != nil {
			_ = httpServer.Close()
			return fmt.Errorf("shutdown gateway: %w", shutdownErr)
		}
		serveErr := <-serveResult
		if serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
			return serveErr
		}
		return nil
	}
}

func shadowEventsHandler(store *storage.Store) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		filter := storage.ShadowFilter{
			Cursor: request.URL.Query().Get("cursor"), Limit: 50,
			Model: request.URL.Query().Get("model"), RequestID: request.URL.Query().Get("request_id"),
			Outcome: request.URL.Query().Get("outcome"), MismatchClass: request.URL.Query().Get("mismatch_class"),
		}
		if raw := request.URL.Query().Get("limit"); raw != "" {
			limit, err := strconv.Atoi(raw)
			if err != nil || limit < 1 || limit > 200 {
				httpapi.WriteError(response, http.StatusBadRequest, "request_error", "invalid_limit", "limit must be between 1 and 200", response.Header().Get("x-request-id"))
				return
			}
			filter.Limit = limit
		}
		for _, value := range []struct {
			raw    string
			target **time.Time
		}{
			{raw: request.URL.Query().Get("from"), target: &filter.From},
			{raw: request.URL.Query().Get("to"), target: &filter.To},
		} {
			if value.raw == "" {
				continue
			}
			parsed, err := time.Parse(time.RFC3339, value.raw)
			if err != nil {
				httpapi.WriteError(response, http.StatusBadRequest, "request_error", "invalid_time", "from and to must be RFC3339 timestamps", response.Header().Get("x-request-id"))
				return
			}
			*value.target = &parsed
		}
		page, err := store.ListShadows(request.Context(), filter)
		if err != nil {
			httpapi.WriteError(response, http.StatusBadRequest, "request_error", "invalid_shadow_query", "The shadow event query is invalid", response.Header().Get("x-request-id"))
			return
		}
		response.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(response).Encode(page)
	})
}

func handlePublicRequest(
	response http.ResponseWriter,
	request *http.Request,
	route httpapi.Route,
	cfg config.Config,
	lookup identity.APIKeyLookup,
	shadow *billing.Service,
	relayClient *relay.Client,
	logger *observability.Logger,
) {
	requestID := response.Header().Get("x-request-id")
	resolved, authErr := identity.AuthenticateStudio(request, cfg.InternalToken)
	if authErr != nil {
		resolved, authErr = identity.AuthenticateAPIKey(request.Context(), request, lookup)
	}
	if authErr != nil {
		if errors.Is(authErr, errAPIKeyVerificationUnavailable) || errors.Is(authErr, storage.ErrUnavailable) {
			httpapi.WriteError(response, http.StatusServiceUnavailable, "authentication_error", "api_key_verification_unavailable", "API key verification is not configured", requestID)
			return
		}
		httpapi.WriteError(response, http.StatusUnauthorized, "authentication_error", "missing_or_invalid_api_key", "Provide a valid API key or trusted Studio identity", requestID)
		return
	}

	var bodyStore *httpapi.BodyStore
	if request.Method != http.MethodGet && request.Method != http.MethodHead {
		var bodyErr error
		bodyStore, bodyErr = httpapi.NewBodyStore(request.Body, httpapi.BodyStoreOptions{MaxBytes: cfg.BodyLimitBytes})
		if bodyErr != nil {
			if errors.Is(bodyErr, httpapi.ErrBodyTooLarge) {
				httpapi.WriteError(response, http.StatusRequestEntityTooLarge, "request_error", "request_body_too_large", "The request body exceeds the configured limit", requestID)
				return
			}
			httpapi.WriteError(response, http.StatusBadRequest, "request_error", "request_body_unreadable", "The request body could not be read", requestID)
			return
		}
		defer func() {
			if closeErr := bodyStore.Close(); closeErr != nil {
				logger.Error(request.Context(), "request body cleanup failed", logFields(requestID, route, cfg, resolved, "body_cleanup_failed"))
			}
		}()
	}

	var operation *billing.Operation
	var estimate usage.Estimate
	if shadow != nil && bodyStore != nil {
		body, bodyErr := readBody(bodyStore)
		if bodyErr == nil {
			protocol := pricingRequestProtocol(route, request.URL.Path)
			if protocol != "" {
				estimate, bodyErr = usage.EstimateRequest(body, "", protocol)
				if bodyErr == nil && estimate.Model != "" {
					operation, _ = shadow.Begin(request.Context(), billing.BeginRequest{
						RequestID: requestID,
						Identity:  resolved,
						Model:     estimate.Model,
						Estimate:  estimate,
						Request:   pricing.RequestInput{Headers: pricingHeaders(request.Header), Body: body, EvaluationTime: time.Now().UTC()},
					})
				}
			}
		}
	}

	incomingURL := *request.URL
	var trustedUserID = &resolved.UserID
	if resolved.UserID == uuid.Nil {
		trustedUserID = nil
	}
	upstreamResponse, relayErr := relayClient.Do(request.Context(), relay.Request{
		Method:                     request.Method,
		Family:                     string(route.Family),
		URL:                        &incomingURL,
		Headers:                    request.Header,
		Body:                       bodyStore,
		RequestID:                  requestID,
		TrustedUserID:              trustedUserID,
		IncludeNewAPICompatibility: resolved.Source == identity.SourceStudio && cfg.UpstreamOwnership == config.OwnershipNonChargingNewAPI,
	}, nil)
	if relayErr != nil {
		if operation != nil {
			_ = shadow.Fail(request.Context(), operation, billing.Failure{ErrorClass: "upstream_unavailable"})
		}
		logger.Warn(request.Context(), "upstream relay failed", logFields(requestID, route, cfg, resolved, "upstream_unavailable"))
		httpapi.WriteError(response, http.StatusBadGateway, "upstream_error", "upstream_unavailable", "The configured upstream is unavailable", requestID)
		return
	}
	var observer relay.Observer
	if operation != nil {
		usageObserver, usageErr := usage.NewRegistry().New(pricingResponseProtocol(route, request.URL.Path), upstreamResponse.Header.Get("Content-Type"), estimate)
		if usageErr == nil {
			observer = billing.NewObserver(shadow, operation, usageObserver)
		} else {
			_ = shadow.Fail(request.Context(), operation, billing.Failure{ErrorClass: "usage_observer_unavailable"})
		}
	}
	relay.StreamResponse(request.Context(), response, upstreamResponse, observer)
}

func readBody(store *httpapi.BodyStore) ([]byte, error) {
	reader, err := store.Open()
	if err != nil {
		return nil, err
	}
	defer reader.Close()
	return io.ReadAll(reader)
}

func pricingHeaders(source http.Header) map[string]string {
	result := make(map[string]string, len(source))
	for name, values := range source {
		if len(values) > 0 {
			result[name] = values[0]
		}
	}
	return result
}

func pricingRequestProtocol(route httpapi.Route, path string) string {
	switch route.Family {
	case config.ProtocolClaude:
		return "claude"
	case config.ProtocolGemini:
		return "gemini"
	case config.ProtocolOpenAI, config.ProtocolImages, config.ProtocolAudio:
		if strings.HasPrefix(path, "/v1/responses") {
			return "responses"
		}
		return "openai"
	default:
		return ""
	}
}

func pricingResponseProtocol(route httpapi.Route, path string) string {
	switch route.Family {
	case config.ProtocolClaude:
		return "claude"
	case config.ProtocolImages:
		return "images"
	case config.ProtocolAudio:
		if strings.Contains(path, "/speech") {
			return "audio_speech"
		}
		return "audio"
	case config.ProtocolOpenAI:
		if strings.HasPrefix(path, "/v1/responses") {
			return "responses"
		}
		return "openai"
	default:
		return ""
	}
}

func logFields(requestID string, route httpapi.Route, cfg config.Config, resolved identity.Identity, errorClass string) observability.Fields {
	fields := observability.Fields{
		RequestID:   requestID,
		Protocol:    string(route.Family),
		BillingMode: string(cfg.BillingMode),
		ErrorClass:  errorClass,
	}
	if resolved.UserID != uuid.Nil {
		fields.UserID = resolved.UserID.String()
	}
	if resolved.APIKeyID != nil {
		fields.APIKeyID = resolved.APIKeyID.String()
	}
	return fields
}

type configuredAPIKeyLookup struct {
	hashes          []string
	allowUnverified bool
}

func (lookup configuredAPIKeyLookup) LookupAPIKey(_ context.Context, digest string) (identity.Identity, error) {
	if len(lookup.hashes) == 0 {
		if lookup.allowUnverified {
			return identity.Identity{}, nil
		}
		return identity.Identity{}, errAPIKeyVerificationUnavailable
	}
	actual := []byte(digest)
	for _, configuredHash := range lookup.hashes {
		expected := []byte(strings.TrimPrefix(strings.ToLower(strings.TrimSpace(configuredHash)), "sha256:"))
		if len(actual) == len(expected) && subtle.ConstantTimeCompare(actual, expected) == 1 {
			return identity.Identity{}, nil
		}
	}
	return identity.Identity{}, identity.ErrAPIKeyNotFound
}
