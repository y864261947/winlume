package main

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
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

	// missingTable makes HasRequiredTables answer per table name rather than
	// with a flat bool, so a test can prove the startup gate actually asks
	// for one specific table.
	missingTable string

	// closed, blockPass, and closedBeforePassReturned exist to make the
	// shutdown ordering from Finding 1 of the Task 19 review testable
	// without a live database: previously Close() was a silent no-op, so a
	// defer-ordering bug that closed the store before the recovery worker's
	// in-flight pass returned was invisible to every test. When blockPass is
	// non-nil, ListSettlementPending blocks on it (after signaling
	// settlementPendingCalled) until the test releases it, simulating a pass
	// still in flight at the moment shutdown begins; if Close() runs while
	// that call is still blocked, closedBeforePassReturned records the
	// violation for the test to assert against.
	closed                   atomic.Bool
	blockPass                chan struct{}
	closedBeforePassReturned atomic.Bool
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
	if f.blockPass != nil {
		<-f.blockPass
		if f.closed.Load() {
			f.closedBeforePassReturned.Store(true)
		}
	}
	return nil, nil
}

func (f *fakeGatewayStore) ListStaleReservations(context.Context, time.Time, int) ([]storage.StaleReservation, error) {
	return nil, nil
}

func (f *fakeGatewayStore) Health(context.Context) error { return f.healthErr }

func (f *fakeGatewayStore) HasRequiredTables(_ context.Context, tables []string) (bool, error) {
	if f.missingTable != "" && slices.Contains(tables, f.missingTable) {
		return false, nil
	}
	return f.hasTables, nil
}

func (f *fakeGatewayStore) ListShadows(context.Context, storage.ShadowFilter) (storage.ShadowPage, error) {
	return storage.ShadowPage{}, nil
}

func (f *fakeGatewayStore) ListServiceAccounts(context.Context) ([]storage.ServiceAccount, error) {
	return nil, nil
}

func (f *fakeGatewayStore) UpdateServiceAccountPolicy(context.Context, uuid.UUID, storage.UpdateServiceAccountPolicyInput) (storage.ServiceAccount, error) {
	return storage.ServiceAccount{}, nil
}

func (f *fakeGatewayStore) RevokeServiceAccountKey(context.Context, uuid.UUID) error { return nil }

func (f *fakeGatewayStore) GetCurrentPricing(context.Context) ([]storage.GroupRuleRecord, []storage.ModelRuleRecord, error) {
	return nil, nil, nil
}

func (f *fakeGatewayStore) ReplaceGroupRules(context.Context, []storage.GroupRuleInput) (uuid.UUID, error) {
	return uuid.Nil, nil
}

func (f *fakeGatewayStore) ReplaceModelRules(context.Context, []storage.ModelRuleInput) (uuid.UUID, error) {
	return uuid.Nil, nil
}

func (f *fakeGatewayStore) ListChannels(context.Context) ([]storage.ChannelRecord, error) {
	return nil, nil
}

func (f *fakeGatewayStore) CreateChannel(context.Context, storage.ChannelInput) (storage.ChannelRecord, error) {
	return storage.ChannelRecord{}, nil
}

func (f *fakeGatewayStore) UpdateChannel(context.Context, uuid.UUID, storage.ChannelInput) (storage.ChannelRecord, error) {
	return storage.ChannelRecord{}, nil
}

func (f *fakeGatewayStore) DeleteChannel(context.Context, uuid.UUID) error { return nil }

func (f *fakeGatewayStore) Close() { f.closed.Store(true) }

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

// TestRunWaitsForInFlightRecoveryPassBeforeClosingStore proves the Finding 1
// fix: on shutdown, run() must wait for the recovery worker's goroutine to
// actually return (background.Wait()) before it closes the store. It blocks
// the worker mid-pass, cancels ctx (starting shutdown), asserts the store is
// still open while the pass is in flight, then releases the pass and asserts
// the store was only closed after run() itself returned - which can only
// happen once the worker's goroutine has observed ctx.Done() and exited.
// Before the fix, store.Close() was deferred (and therefore ran, LIFO)
// before background.Wait(), so this would have closed the store out from
// under the in-flight ListSettlementPending call.
func TestRunWaitsForInFlightRecoveryPassBeforeClosingStore(t *testing.T) {
	store := newFakeGatewayStore()
	store.blockPass = make(chan struct{})
	withFakeOpenStore(t, store, nil)

	cfg := billingCapableConfig(t, config.BillingAuthoritative)
	listener := listenLocal(t)
	ctx, cancel := context.WithCancel(context.Background())
	result := make(chan error, 1)
	go func() { result <- run(ctx, cfg, listener) }()

	select {
	case <-store.settlementPendingCalled:
	case <-time.After(2 * time.Second):
		t.Fatal("recovery worker did not run a pass")
	}

	// The worker is now blocked inside ListSettlementPending, simulating a
	// pass still in flight. Trigger shutdown and confirm the store is not
	// closed while the pass remains blocked.
	cancel()
	require.Never(t, func() bool { return store.closed.Load() }, 300*time.Millisecond, 20*time.Millisecond,
		"store must not be closed while the recovery worker's pass is still in flight")

	// Release the blocked pass so the worker's Run loop can observe
	// ctx.Done() and return.
	close(store.blockPass)

	select {
	case err := <-result:
		require.NoError(t, err)
	case <-time.After(2 * time.Second):
		t.Fatal("gateway did not shut down after the blocked recovery pass was released")
	}

	require.True(t, store.closed.Load(), "store must be closed once run() returns")
	require.False(t, store.closedBeforePassReturned.Load(),
		"store.Close() must not run until after the recovery worker's in-flight pass returned")
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

	// Every funding-path table must be gated, not just the ledger tables the
	// list originally carried: a missing billing_profiles used to surface
	// only on the first paid request.
	t.Run("missing_funding_path_table", func(t *testing.T) {
		for _, table := range []string{
			"billing_profiles",
			"wallets",
			"wallet_ledger_entries",
			"subscriptions",
			"subscription_quota_states",
			"api_key_billing_policies",
		} {
			t.Run(table, func(t *testing.T) {
				store := newFakeGatewayStore()
				store.missingTable = table
				err := runStartupGates(context.Background(), baseCfg(config.BillingAuthoritative), store)
				require.ErrorContains(t, err, "required tables are missing")
			})
		}
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

	handlePublicRequest(response, request, route, cfg, configuredAPIKeyLookup{}, nil, lifecycle, relayClient, logger, metrics)

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
