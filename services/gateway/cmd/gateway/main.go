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
	"path/filepath"
	"strconv"
	"strings"
	"sync"
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

// recoveryStatsPollInterval controls how often the running process converts
// the recovery worker's cumulative Stats() into metric deltas. It is
// deliberately decoupled from billing.RecoveryInterval (the worker's own
// pass cadence) so metrics stay reasonably fresh even if that interval
// changes.
const recoveryStatsPollInterval = 30 * time.Second

// authoritativeRequiredTables and shadowRequiredTables are the tables the
// startup gate checks for presence before the gateway will bind its
// listener in that billing mode. They are intentionally static, developer
// maintained lists, not derived from any runtime input.
var (
	authoritativeRequiredTables = []string{
		"usage_events",
		"gateway_relay_attempts",
		"pricing_catalog_versions",
		"api_key_quota_ledger_entries",
		"subscription_quota_ledger_entries",
		// Every table on the funding path. A missing one of these used to
		// surface only on the first paid request instead of at startup.
		"billing_profiles",
		"wallets",
		"wallet_ledger_entries",
		"subscriptions",
		"subscription_quota_states",
		"api_key_billing_policies",
	}
	shadowRequiredTables = []string{
		"usage_events",
		"billing_shadow_events",
		"pricing_catalog_versions",
	}
)

var errAPIKeyVerificationUnavailable = errors.New("API key verification unavailable")

// gatewayStore is the full storage surface run() depends on across identity
// lookup, shadow and authoritative billing, recovery, and startup gates. It
// exists so tests can inject a fake in place of storage.Open, which requires
// a live Postgres connection this environment does not have.
type gatewayStore interface {
	identity.APIKeyLookup
	billing.CatalogLoader
	billing.AuthoritativeRepository
	billing.ShadowWriter
	billing.RecoveryRepository
	Health(ctx context.Context) error
	HasRequiredTables(ctx context.Context, tables []string) (bool, error)
	ListShadows(ctx context.Context, filter storage.ShadowFilter) (storage.ShadowPage, error)
	Close()
}

// openStore is a seam over storage.Open so tests can substitute a fake store
// without a live database connection. Production code never reassigns it.
var openStore = defaultOpenStore

func defaultOpenStore(ctx context.Context, databaseURL string) (gatewayStore, error) {
	store, err := storage.Open(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	return store, nil
}

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
	metrics := observability.NewMetrics()
	relayClient := relay.NewClient(selector, relay.ClientOptions{})
	var lookup identity.APIKeyLookup = configuredAPIKeyLookup{hashes: cfg.APIKeyHashes, allowUnverified: cfg.AllowUnverifiedAPIKeys}
	var lifecycle billing.Lifecycle
	var billingReady httpapi.ReadinessProbe
	var internalHandler http.Handler

	if cfg.BillingMode == config.BillingShadow || cfg.BillingMode == config.BillingAuthoritative {
		store, storageErr := openStore(ctx, cfg.DatabaseURL)
		if storageErr != nil {
			_ = listener.Close()
			return storageErr
		}
		defer store.Close()

		// background collects every long-running goroutine started for this
		// billing mode (the recovery worker, its metrics poller) so shutdown
		// can wait for them to observe ctx.Done() and return before store.Close()
		// runs, instead of racing an in-flight recovery pass against a closed
		// connection pool. Declared (and its Wait deferred) AFTER store.Close()
		// is deferred so that, by LIFO defer ordering, background.Wait() runs
		// FIRST on the way out and store.Close() only runs once every
		// goroutine tracked by background has actually returned.
		var background sync.WaitGroup
		defer background.Wait()

		if gateErr := runStartupGates(ctx, cfg, store); gateErr != nil {
			_ = listener.Close()
			return gateErr
		}

		lookup = store
		if cfg.BillingMode == config.BillingShadow {
			lifecycle = billing.NewShadowService(store, store)
			internalHandler = shadowEventsHandler(store)
		} else {
			// Authoritative mode: wire the local recovery spool into the
			// service (so a completion that cannot reach Postgres is still
			// durably recorded) and start the recovery worker that finishes
			// interrupted operations left in settlement_pending, reserved,
			// or the local spool.
			spool := billing.NewSpool(cfg.RecoveryDir)
			lifecycle = billing.NewAuthoritativeService(store, store, billing.WithRecoverySpool(spool))
			worker := billing.NewRecoveryWorker(store, spool, billing.WithRecoveryLogger(logger))
			startRecoveryWorker(ctx, &background, worker, metrics)
		}
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
		MetricsHandler:  metrics.Handler(),
		PublicHandler: func(response http.ResponseWriter, request *http.Request, route httpapi.Route) {
			handlePublicRequest(response, request, route, cfg, lookup, lifecycle, relayClient, logger, metrics)
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

// startRecoveryWorker starts the recovery worker's Run loop and a companion
// goroutine that periodically converts its cumulative Stats() into metric
// deltas. Both goroutines stop the moment ctx is cancelled; background lets
// run() wait for them to actually return during shutdown.
func startRecoveryWorker(ctx context.Context, background *sync.WaitGroup, worker *billing.RecoveryWorker, metrics *observability.Metrics) {
	background.Add(1)
	go func() {
		defer background.Done()
		worker.Run(ctx)
	}()

	background.Add(1)
	go func() {
		defer background.Done()
		pollRecoveryStats(ctx, worker, metrics)
	}()
}

func pollRecoveryStats(ctx context.Context, worker *billing.RecoveryWorker, metrics *observability.Metrics) {
	ticker := time.NewTicker(recoveryStatsPollInterval)
	defer ticker.Stop()
	var previous billing.RecoveryStats
	report := func() {
		current := worker.Stats()
		metrics.RecordRecovery("settled", float64(current.Settled-previous.Settled))
		metrics.RecordRecovery("replayed", float64(current.Replayed-previous.Replayed))
		metrics.RecordRecovery("reversed", float64(current.Reversed-previous.Reversed))
		metrics.RecordRecovery("skipped", float64(current.Skipped-previous.Skipped))
		metrics.RecordRecovery("deferred", float64(current.Deferred-previous.Deferred))
		metrics.RecordRecovery("error", float64(current.Errors-previous.Errors))
		previous = current
	}
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			report()
		}
	}
}

// runStartupGates enforces the authoritative/shadow billing safety gates
// before the gateway ever binds its listener. It fails closed: any gate
// failure returns an error and the caller must never fall back to a less
// strict billing mode. Shadow mode requires database connectivity, required
// tables, and an active catalog, but - unlike authoritative - never requires
// ownership transfer (WINLUME_GATEWAY_BILLING_OWNER, upstream ownership, or
// the recovery directory) because it never mutates customer funding.
func runStartupGates(ctx context.Context, cfg config.Config, store gatewayStore) error {
	if cfg.BillingMode != config.BillingShadow && cfg.BillingMode != config.BillingAuthoritative {
		return nil
	}
	if err := store.Health(ctx); err != nil {
		return fmt.Errorf("billing startup gate: database connectivity check failed: %w", err)
	}

	tables := shadowRequiredTables
	if cfg.BillingMode == config.BillingAuthoritative {
		tables = authoritativeRequiredTables
	}
	ok, err := store.HasRequiredTables(ctx, tables)
	if err != nil {
		return fmt.Errorf("billing startup gate: migration presence check failed: %w", err)
	}
	if !ok {
		return fmt.Errorf("billing startup gate: required tables are missing; run pending migrations before enabling %s billing", cfg.BillingMode)
	}

	if _, err := store.LoadActiveCatalog(ctx); err != nil {
		return fmt.Errorf("billing startup gate: no active, valid pricing catalog: %w", err)
	}

	if strings.TrimSpace(cfg.InternalToken) == "" {
		return fmt.Errorf("billing startup gate: an internal token is required")
	}

	if len(cfg.Upstreams) == 0 {
		return fmt.Errorf("billing startup gate: at least one upstream must be configured")
	}

	if cfg.BillingMode != config.BillingAuthoritative {
		return nil
	}

	if cfg.BillingOwner != "go" {
		return fmt.Errorf("billing startup gate: authoritative billing requires WINLUME_GATEWAY_BILLING_OWNER=go")
	}
	if cfg.UpstreamOwnership != config.OwnershipProvider && cfg.UpstreamOwnership != config.OwnershipNonChargingNewAPI {
		return fmt.Errorf("billing startup gate: authoritative billing requires an allowed upstream ownership")
	}
	if err := checkRecoveryDirWritable(cfg.RecoveryDir); err != nil {
		return fmt.Errorf("billing startup gate: recovery directory: %w", err)
	}
	return nil
}

// checkRecoveryDirWritable verifies the configured recovery directory can be
// created (or already exists) and is actually writable by this process,
// rather than only checking that the configuration string is non-empty. A
// directory that exists but is not writable would otherwise only be
// discovered the first time Complete needed the local spool - after bytes
// had already reached a client - which is exactly the failure mode the
// startup gate exists to catch before the process ever starts serving.
func checkRecoveryDirWritable(dir string) error {
	dir = strings.TrimSpace(dir)
	if dir == "" {
		return fmt.Errorf("recovery directory is not configured")
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("recovery directory cannot be created: %w", err)
	}
	probe := filepath.Join(dir, ".startup-gate-probe")
	if err := os.WriteFile(probe, []byte("ok"), 0o600); err != nil {
		return fmt.Errorf("recovery directory is not writable: %w", err)
	}
	_ = os.Remove(probe)
	return nil
}

func shadowEventsHandler(store gatewayStore) http.Handler {
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
	lifecycle billing.Lifecycle,
	relayClient *relay.Client,
	logger *observability.Logger,
	metrics *observability.Metrics,
) {
	requestID := response.Header().Get("x-request-id")
	protocol := string(route.Family)
	var estimate usage.Estimate
	recordOutcome := func(outcome string) {
		metrics.RecordRequest(protocol, estimate.Model, string(cfg.BillingMode), outcome)
	}

	resolved, authErr := identity.AuthenticateStudio(request, cfg.InternalToken)
	if authErr != nil {
		resolved, authErr = identity.AuthenticateAPIKey(request.Context(), request, lookup)
	}
	if authErr != nil {
		recordOutcome("auth_error")
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
			recordOutcome("request_error")
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
	if lifecycle != nil && bodyStore != nil {
		body, bodyErr := readBody(bodyStore)
		if bodyErr == nil {
			protocolFamily := pricingRequestProtocol(route, request.URL.Path)
			if protocolFamily != "" {
				estimate, bodyErr = usage.EstimateRequest(body, "", protocolFamily)
				if bodyErr == nil && estimate.Model != "" {
					operation, bodyErr = lifecycle.Begin(request.Context(), billing.BeginRequest{
						RequestID:      requestID,
						IdempotencyKey: request.Header.Get("Idempotency-Key"),
						Provider:       string(route.Family),
						Identity:       resolved,
						Model:          estimate.Model,
						Estimate:       estimate,
						Request:        pricing.RequestInput{Headers: pricingHeaders(request.Header), Body: body, EvaluationTime: time.Now().UTC()},
					})
					if bodyErr != nil && cfg.BillingMode == config.BillingAuthoritative {
						if errors.Is(bodyErr, billing.ErrInsufficientFunds) {
							metrics.RecordInsufficientFunds(protocol)
							metrics.RecordBillingOperation(string(cfg.BillingMode), "reserve", "insufficient_funds")
						} else {
							metrics.RecordBillingOperation(string(cfg.BillingMode), "reserve", "error")
						}
						recordOutcome("billing_error")
						writeAuthoritativeBillingError(response, requestID, bodyErr)
						return
					}
					if bodyErr == nil {
						metrics.RecordBillingOperation(string(cfg.BillingMode), "reserve", "success")
					}
				} else if cfg.BillingMode == config.BillingAuthoritative {
					recordOutcome("request_error")
					httpapi.WriteError(response, http.StatusBadRequest, "request_error", "billing_usage_unavailable", "The request model and usage estimate could not be determined", requestID)
					return
				}
			}
		} else if cfg.BillingMode == config.BillingAuthoritative {
			recordOutcome("request_error")
			httpapi.WriteError(response, http.StatusBadRequest, "request_error", "billing_request_unreadable", "The request could not be read for billing", requestID)
			return
		}
	}

	incomingURL := *request.URL
	var trustedUserID = &resolved.UserID
	if resolved.UserID == uuid.Nil {
		trustedUserID = nil
	}
	upstreamResponse, attemptHistory, relayErr := relayClient.Relay(request.Context(), relay.Request{
		Method:                     request.Method,
		Family:                     protocol,
		URL:                        &incomingURL,
		Headers:                    request.Header,
		Body:                       bodyStore,
		RequestID:                  requestID,
		TrustedUserID:              trustedUserID,
		IncludeNewAPICompatibility: resolved.Source == identity.SourceStudio && cfg.UpstreamOwnership == config.OwnershipNonChargingNewAPI,
	}, relay.DefaultRetryPolicy())
	for _, attempt := range attemptHistory {
		metrics.RecordAttempt(protocol, string(attempt.Outcome))
	}
	if relayErr != nil {
		if operation != nil {
			_ = lifecycle.Fail(request.Context(), operation, billing.Failure{ErrorClass: "upstream_unavailable"})
			metrics.RecordBillingOperation(string(cfg.BillingMode), "refund", "success")
		}
		recordOutcome("upstream_error")
		logger.Warn(request.Context(), "upstream relay failed", logFields(requestID, route, cfg, resolved, "upstream_unavailable"))
		httpapi.WriteError(response, http.StatusBadGateway, "upstream_error", "upstream_unavailable", "The configured upstream is unavailable", requestID)
		return
	}

	// Recording relay attempt diagnostics is best-effort audit data, never on
	// the critical path to the client: it happens in its own goroutine with
	// its own bounded timeout so a slow or failing storage write can never
	// delay or fail the response already being streamed to the caller.
	if operation != nil {
		if recorder, ok := lifecycle.(billing.AttemptRecorder); ok {
			go recordAttemptsBestEffort(request.Context(), recorder, operation, attemptHistory)
		}
	}

	var observer relay.Observer
	if operation != nil {
		usageObserver, usageErr := usage.NewRegistry().New(pricingResponseProtocol(route, request.URL.Path), upstreamResponse.Header.Get("Content-Type"), estimate)
		if usageErr == nil {
			observer = billing.NewObserver(lifecycle, operation, usageObserver)
		} else {
			_ = lifecycle.Fail(request.Context(), operation, billing.Failure{ErrorClass: "usage_observer_unavailable"})
			metrics.RecordBillingOperation(string(cfg.BillingMode), "refund", "success")
		}
	}
	completion := relay.StreamResponse(request.Context(), response, upstreamResponse, observer)
	if observer != nil {
		// billing.Observer.Complete already ran synchronously inside
		// StreamResponse and owns the actual settle/fail outcome internally;
		// it does not return one here, so this only proves a settlement was
		// dispatched for this operation, never whether it actually succeeded
		// or failed. Deliberately NOT labeled "success"/"failure"/"attempted"
		// (which would look like a real outcome and invite a success/failure
		// alert that could never fire as expected) - it is labeled
		// "dispatched" instead. Plumbing the real settle outcome back here
		// requires a change to billing/service.go's Complete signature,
		// which is out of this task's scope; tracked as a follow-up.
		metrics.RecordBillingOperation(string(cfg.BillingMode), "settle", "dispatched")
	}
	if completion.Err != nil || upstreamResponse.StatusCode >= http.StatusInternalServerError {
		recordOutcome("upstream_error")
		return
	}
	recordOutcome("success")
}

// recordAttemptsBestEffort persists relay retry diagnostics against
// operation's shared billing record without ever blocking or failing the
// response already sent to the client. It runs detached from the request
// context (which is cancelled the moment the handler returns) but still
// bounded, so a stalled storage write cannot leak a goroutine forever.
func recordAttemptsBestEffort(requestCtx context.Context, recorder billing.AttemptRecorder, operation *billing.Operation, history relay.AttemptHistory) {
	recordCtx, cancel := context.WithTimeout(context.WithoutCancel(requestCtx), 5*time.Second)
	defer cancel()
	_ = recorder.RecordAttempts(recordCtx, operation, history)
}

// writeAuthoritativeBillingError fails before any upstream call. Shadow mode
// intentionally never exposes these storage outcomes to a caller because it
// cannot mutate customer funding.
func writeAuthoritativeBillingError(response http.ResponseWriter, requestID string, err error) {
	switch {
	case errors.Is(err, billing.ErrInsufficientFunds):
		httpapi.WriteError(response, http.StatusForbidden, "billing_error", "insufficient_quota", "Insufficient API key or account quota", requestID)
	case errors.Is(err, billing.ErrOperationInFlight):
		httpapi.WriteError(response, http.StatusConflict, "idempotency_error", "operation_in_flight", "A request with this idempotency key is still in progress", requestID)
	case errors.Is(err, billing.ErrOperationAlreadyCompleted):
		httpapi.WriteError(response, http.StatusConflict, "idempotency_error", "operation_already_completed", "A request with this idempotency key has already completed", requestID)
	default:
		httpapi.WriteError(response, http.StatusServiceUnavailable, "billing_error", "billing_unavailable", "Billing is temporarily unavailable", requestID)
	}
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
