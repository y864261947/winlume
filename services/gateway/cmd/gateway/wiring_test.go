package main

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

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

// ---------------------------------------------------------------------------
// Gap 1: the recovery worker (Task 17) must actually start in authoritative
// mode and must not start in shadow or off mode.
// ---------------------------------------------------------------------------

// fakeGatewayStore implements gatewayStore without a live database, so the
// recovery worker and startup gate wiring can be exercised in this
// environment (no Postgres available). It signals settlementPendingCalled
// every time the recovery worker's settle pass runs, which is the cheapest
// reliable proof that RecoveryWorker.Run actually executed a pass.
type fakeGatewayStore struct {
	settlementPendingCalled chan struct{}
	hasTables               bool
	healthErr               error
}

func newFakeGatewayStore() *fakeGatewayStore {
	return &fakeGatewayStore{settlementPendingCalled: make(chan struct{}, 64), hasTables: true}
}

func (f *fakeGatewayStore) LookupAPIKey(context.Context, string) (identity.Identity, error) {
	return identity.Identity{}, nil
}

func (f *fakeGatewayStore) LoadActiveCatalog(context.Context) (pricing.Catalog, error) {
	return pricing.Catalog{}, nil
}

func (f *fakeGatewayStore) Reserve(context.Context, storage.ReservationRequest) (storage.Reservation, error) {
	return storage.Reservation{UsageEventID: uuid.New()}, nil
}

func (f *fakeGatewayStore) PersistCompletion(context.Context, storage.CompletionSnapshot) error {
	return nil
}

func (f *fakeGatewayStore) Settle(context.Context, uuid.UUID) (storage.Settlement, error) {
	return storage.Settlement{}, nil
}

func (f *fakeGatewayStore) Reverse(context.Context, uuid.UUID) error { return nil }

func (f *fakeGatewayStore) RecordRelayAttempt(context.Context, storage.RelayAttemptRecord) error {
	return nil
}

func (f *fakeGatewayStore) InsertShadow(context.Context, storage.ShadowEvent) (uuid.UUID, error) {
	return uuid.New(), nil
}

func (f *fakeGatewayStore) ListSettlementPending(context.Context, int) ([]storage.PendingSettlement, error) {
	select {
	case f.settlementPendingCalled <- struct{}{}:
	default:
	}
	return nil, nil
}

func (f *fakeGatewayStore) ListStaleReservations(context.Context, time.Time, int) ([]storage.StaleReservation, error) {
	return nil, nil
}

func (f *fakeGatewayStore) Health(context.Context) error { return f.healthErr }

func (f *fakeGatewayStore) HasRequiredTables(context.Context, []string) (bool, error) {
	return f.hasTables, nil
}

func (f *fakeGatewayStore) ListShadows(context.Context, storage.ShadowFilter) (storage.ShadowPage, error) {
	return storage.ShadowPage{}, nil
}

func (f *fakeGatewayStore) Close() {}

func withFakeOpenStore(t *testing.T, store gatewayStore, storeErr error) {
	t.Helper()
	original := openStore
	openStore = func(context.Context, string) (gatewayStore, error) { return store, storeErr }
	t.Cleanup(func() { openStore = original })
}

func billingCapableConfig(t *testing.T, mode config.BillingMode) config.Config {
	t.Helper()
	upstream := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(upstream.Close)
	return config.Config{
		Host:              "127.0.0.1",
		BillingMode:       mode,
		BodyLimitBytes:    1024 * 1024,
		DatabaseURL:       "postgres://fake/unused",
		InternalToken:     "internal-secret",
		BillingOwner:      "go",
		UpstreamOwnership: config.OwnershipProvider,
		RecoveryDir:       t.TempDir(),
		Upstreams: map[config.ProtocolFamily]config.UpstreamConfig{
			config.ProtocolOpenAI: {BaseURL: upstream.URL},
		},
	}
}

func TestRunStartsRecoveryWorkerInAuthoritativeMode(t *testing.T) {
	store := newFakeGatewayStore()
	withFakeOpenStore(t, store, nil)

	cfg := billingCapableConfig(t, config.BillingAuthoritative)
	listener := listenLocal(t)
	ctx, cancel := context.WithCancel(context.Background())
	result := make(chan error, 1)
	go func() { result <- run(ctx, cfg, listener) }()

	select {
	case <-store.settlementPendingCalled:
	case <-time.After(2 * time.Second):
		t.Fatal("recovery worker did not run a pass in authoritative mode")
	}

	cancel()
	select {
	case err := <-result:
		require.NoError(t, err)
	case <-time.After(2 * time.Second):
		t.Fatal("gateway did not shut down after context cancellation")
	}
}

func TestRunDoesNotStartRecoveryWorkerInShadowMode(t *testing.T) {
	store := newFakeGatewayStore()
	withFakeOpenStore(t, store, nil)

	cfg := billingCapableConfig(t, config.BillingShadow)
	listener := listenLocal(t)
	ctx, cancel := context.WithCancel(context.Background())
	result := make(chan error, 1)
	go func() { result <- run(ctx, cfg, listener) }()

	baseURL := "http://" + listener.Addr().String()
	health := getEventually(t, baseURL+"/healthz")
	require.NoError(t, health.Body.Close())

	select {
	case <-store.settlementPendingCalled:
		t.Fatal("recovery worker must not run in shadow mode")
	case <-time.After(200 * time.Millisecond):
	}

	cancel()
	select {
	case err := <-result:
		require.NoError(t, err)
	case <-time.After(2 * time.Second):
		t.Fatal("gateway did not shut down after context cancellation")
	}
}

func TestRunDoesNotStartRecoveryWorkerInOffMode(t *testing.T) {
	// Off mode never opens a store at all, so openStore is left untouched: a
	// call to it here would be a bug in run(), and this test relies on the
	// real seam still pointing at storage.Open to catch that regression.
	upstream := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	cfg := runnableConfig(upstream.URL)
	listener := listenLocal(t)
	ctx, cancel := context.WithCancel(context.Background())
	result := make(chan error, 1)
	go func() { result <- run(ctx, cfg, listener) }()

	baseURL := "http://" + listener.Addr().String()
	health := getEventually(t, baseURL+"/healthz")
	require.NoError(t, health.Body.Close())

	cancel()
	select {
	case err := <-result:
		require.NoError(t, err)
	case <-time.After(2 * time.Second):
		t.Fatal("gateway did not shut down after context cancellation")
	}
}

// ---------------------------------------------------------------------------
// Startup gates
// ---------------------------------------------------------------------------

func TestRunStartupGatesSkipNonBillingModes(t *testing.T) {
	require.NoError(t, runStartupGates(context.Background(), config.Config{BillingMode: config.BillingOff}, nil))
}

func TestRunStartupGatesFailClosedOnEachCheck(t *testing.T) {
	baseCfg := func(mode config.BillingMode) config.Config {
		return config.Config{
			BillingMode:       mode,
			InternalToken:     "secret",
			BillingOwner:      "go",
			UpstreamOwnership: config.OwnershipProvider,
			RecoveryDir:       t.TempDir(),
			Upstreams:         map[config.ProtocolFamily]config.UpstreamConfig{config.ProtocolOpenAI: {BaseURL: "https://example.com"}},
		}
	}

	t.Run("database_unhealthy", func(t *testing.T) {
		store := newFakeGatewayStore()
		store.healthErr = storage.ErrUnavailable
		err := runStartupGates(context.Background(), baseCfg(config.BillingAuthoritative), store)
		require.ErrorIs(t, err, storage.ErrUnavailable)
	})

	t.Run("missing_tables", func(t *testing.T) {
		store := newFakeGatewayStore()
		store.hasTables = false
		err := runStartupGates(context.Background(), baseCfg(config.BillingAuthoritative), store)
		require.ErrorContains(t, err, "required tables are missing")
	})

	t.Run("no_internal_token", func(t *testing.T) {
		store := newFakeGatewayStore()
		cfg := baseCfg(config.BillingShadow)
		cfg.InternalToken = ""
		err := runStartupGates(context.Background(), cfg, store)
		require.ErrorContains(t, err, "internal token")
	})

	t.Run("no_upstreams", func(t *testing.T) {
		store := newFakeGatewayStore()
		cfg := baseCfg(config.BillingShadow)
		cfg.Upstreams = nil
		err := runStartupGates(context.Background(), cfg, store)
		require.ErrorContains(t, err, "at least one upstream")
	})

	t.Run("wrong_billing_owner", func(t *testing.T) {
		store := newFakeGatewayStore()
		cfg := baseCfg(config.BillingAuthoritative)
		cfg.BillingOwner = "new-api"
		err := runStartupGates(context.Background(), cfg, store)
		require.ErrorContains(t, err, "BILLING_OWNER=go")
	})

	t.Run("disallowed_upstream_ownership", func(t *testing.T) {
		store := newFakeGatewayStore()
		cfg := baseCfg(config.BillingAuthoritative)
		cfg.UpstreamOwnership = "unexpected"
		err := runStartupGates(context.Background(), cfg, store)
		require.ErrorContains(t, err, "upstream ownership")
	})

	t.Run("recovery_dir_unusable", func(t *testing.T) {
		store := newFakeGatewayStore()
		cfg := baseCfg(config.BillingAuthoritative)
		// A path whose parent segment is a regular file can never become a
		// directory, so MkdirAll reliably fails on every platform.
		blocker := filepath.Join(t.TempDir(), "not-a-directory")
		require.NoError(t, os.WriteFile(blocker, []byte("x"), 0o600))
		cfg.RecoveryDir = filepath.Join(blocker, "recovery")
		err := runStartupGates(context.Background(), cfg, store)
		require.ErrorContains(t, err, "recovery directory")
	})

	t.Run("shadow_mode_does_not_require_ownership_transfer", func(t *testing.T) {
		store := newFakeGatewayStore()
		cfg := baseCfg(config.BillingShadow)
		cfg.BillingOwner = ""
		cfg.UpstreamOwnership = ""
		cfg.RecoveryDir = ""
		require.NoError(t, runStartupGates(context.Background(), cfg, store))
	})

	t.Run("authoritative_passes_every_gate", func(t *testing.T) {
		store := newFakeGatewayStore()
		require.NoError(t, runStartupGates(context.Background(), baseCfg(config.BillingAuthoritative), store))
	})
}

func TestCheckRecoveryDirWritableCreatesAndProbesDirectory(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "nested", "recovery")
	require.NoError(t, checkRecoveryDirWritable(dir))
	info, err := os.Stat(dir)
	require.NoError(t, err)
	require.True(t, info.IsDir())
}

func TestCheckRecoveryDirWritableRejectsEmpty(t *testing.T) {
	require.Error(t, checkRecoveryDirWritable("  "))
}

// ---------------------------------------------------------------------------
// Gap 2: handlePublicRequest must call the retrying relay.Client.Relay
// instead of the single-attempt Do, and must record attempts through the
// AttemptRecorder capability on a successful multi-attempt relay.
// ---------------------------------------------------------------------------

type fakeAttemptRecorderLifecycle struct {
	mu      sync.Mutex
	history relay.AttemptHistory
	called  bool
}

func (f *fakeAttemptRecorderLifecycle) Begin(_ context.Context, request billing.BeginRequest) (*billing.Operation, error) {
	return &billing.Operation{ID: uuid.New(), UsageEventID: uuid.New(), RequestID: request.RequestID, Identity: request.Identity}, nil
}

func (f *fakeAttemptRecorderLifecycle) Complete(context.Context, *billing.Operation, usage.Canonical, relay.Completion) (billing.Result, error) {
	return billing.Result{}, nil
}

func (f *fakeAttemptRecorderLifecycle) Fail(context.Context, *billing.Operation, billing.Failure) error {
	return nil
}

func (f *fakeAttemptRecorderLifecycle) RecordAttempts(_ context.Context, _ *billing.Operation, history relay.AttemptHistory) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.called = true
	f.history = history
	return nil
}

func (f *fakeAttemptRecorderLifecycle) recordedHistory() (relay.AttemptHistory, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.history, f.called
}

func TestHandlePublicRequestRetriesAndRecordsAttemptHistory(t *testing.T) {
	var upstreamCalls int32
	upstream := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		if atomic.AddInt32(&upstreamCalls, 1) == 1 {
			response.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		response.Header().Set("Content-Type", "application/json")
		response.WriteHeader(http.StatusOK)
		_, _ = response.Write([]byte(`{"ok":true}`))
	}))
	defer upstream.Close()

	cfg := runnableConfig(upstream.URL)
	cfg.InternalToken = "studio-secret"
	selector, err := relay.NewStaticSelector(cfg.Upstreams)
	require.NoError(t, err)
	relayClient := relay.NewClient(selector, relay.ClientOptions{})
	logger := observability.NewLogger(io.Discard)
	metrics := observability.NewMetrics()
	lifecycle := &fakeAttemptRecorderLifecycle{}
	route := httpapi.Route{Family: config.ProtocolOpenAI}

	request := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"gpt-test"}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("x-winlume-internal-token", "studio-secret")
	request.Header.Set("x-winlume-internal-user-id", uuid.NewString())
	response := httptest.NewRecorder()

	handlePublicRequest(response, request, route, cfg, configuredAPIKeyLookup{}, lifecycle, relayClient, logger, metrics)

	require.Equal(t, http.StatusOK, response.Code)
	require.GreaterOrEqual(t, int(atomic.LoadInt32(&upstreamCalls)), 2, "the retrying Relay path must retry the first 503")

	require.Eventually(t, func() bool {
		_, called := lifecycle.recordedHistory()
		return called
	}, 2*time.Second, 10*time.Millisecond, "RecordAttempts must be called for a successful multi-attempt relay")

	history, _ := lifecycle.recordedHistory()
	require.GreaterOrEqual(t, len(history), 2)
	require.Equal(t, relay.AttemptRetried, history[0].Outcome)
	require.Equal(t, relay.AttemptCommitted, history[len(history)-1].Outcome)
}
