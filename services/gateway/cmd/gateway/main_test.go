package main

import (
	"bytes"
	"context"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"reizo/services/gateway/internal/config"
	"reizo/services/gateway/internal/identity"
)

func TestRunServesHealthAndReadyThenShutsDown(t *testing.T) {
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
	require.Equal(t, http.StatusOK, health.StatusCode)
	require.NoError(t, health.Body.Close())
	ready := getEventually(t, baseURL+"/readyz")
	require.Equal(t, http.StatusOK, ready.StatusCode)
	require.NoError(t, ready.Body.Close())

	cancel()
	select {
	case err := <-result:
		require.NoError(t, err)
	case <-time.After(2 * time.Second):
		t.Fatal("gateway did not shut down after context cancellation")
	}
}

func TestRunAuthenticatesStudioAndRelaysWithoutBilling(t *testing.T) {
	userID := uuid.New()
	capturedUser := make(chan string, 1)
	capturedBody := make(chan []byte, 1)
	upstream := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		body, err := io.ReadAll(request.Body)
		if err != nil {
			t.Errorf("read upstream body: %v", err)
			return
		}
		capturedUser <- request.Header.Get("new-api-user")
		capturedBody <- body
		response.Header().Set("Content-Type", "application/json")
		_, _ = response.Write([]byte(`{"ok":true}`))
	}))
	defer upstream.Close()

	cfg := runnableConfig(upstream.URL)
	cfg.InternalToken = "studio-secret"
	cfg.UpstreamOwnership = config.OwnershipNonChargingNewAPI
	baseURL, stop := startGateway(t, cfg)
	defer stop()

	payload := []byte(`{"model":"gpt-test"}`)
	request, err := http.NewRequest(http.MethodPost, baseURL+"/v1/chat/completions?stream=true", bytes.NewReader(payload))
	require.NoError(t, err)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("x-reizo-internal-token", "studio-secret")
	request.Header.Set("x-reizo-internal-user-id", userID.String())
	request.Header.Set("new-api-user", "browser-spoof")
	response, err := http.DefaultClient.Do(request)
	require.NoError(t, err)
	defer response.Body.Close()
	require.Equal(t, http.StatusOK, response.StatusCode)
	actualResponse, err := io.ReadAll(response.Body)
	require.NoError(t, err)
	require.JSONEq(t, `{"ok":true}`, string(actualResponse))
	require.Equal(t, userID.String(), <-capturedUser)
	require.Equal(t, payload, <-capturedBody)

	unauthorized, err := http.Post(baseURL+"/v1/chat/completions", "application/json", bytes.NewReader(payload))
	require.NoError(t, err)
	defer unauthorized.Body.Close()
	require.Equal(t, http.StatusUnauthorized, unauthorized.StatusCode)
}

func TestRunAuthenticatesConfiguredStaticAPIKeyInOffMode(t *testing.T) {
	upstreamCalls := make(chan struct{}, 1)
	upstream := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		upstreamCalls <- struct{}{}
		response.WriteHeader(http.StatusNoContent)
	}))
	defer upstream.Close()

	rawAPIKey := "wl_static_secret"
	cfg := runnableConfig(upstream.URL)
	cfg.APIKeyHashes = []string{identity.HashAPIKey(rawAPIKey)}
	baseURL, stop := startGateway(t, cfg)
	defer stop()

	request, err := http.NewRequest(http.MethodPost, baseURL+"/v1/chat/completions", bytes.NewReader([]byte("{}")))
	require.NoError(t, err)
	request.Header.Set("Authorization", "Bearer "+rawAPIKey)
	response, err := http.DefaultClient.Do(request)
	require.NoError(t, err)
	defer response.Body.Close()
	require.Equal(t, http.StatusNoContent, response.StatusCode)
	select {
	case <-upstreamCalls:
	case <-time.After(time.Second):
		t.Fatal("authenticated request did not reach upstream")
	}
}

func TestExecuteReturnsNonZeroForInvalidConfigWithoutOpeningListener(t *testing.T) {
	listenCalled := false
	exitCode := execute(
		context.Background(),
		func() (config.Config, error) { return config.Config{BillingMode: config.BillingShadow}, nil },
		func(_, _ string) (net.Listener, error) {
			listenCalled = true
			return nil, nil
		},
		io.Discard,
	)

	require.Equal(t, 1, exitCode)
	require.False(t, listenCalled)
}

func runnableConfig(upstreamURL string) config.Config {
	return config.Config{
		Host:           "127.0.0.1",
		BillingMode:    config.BillingOff,
		BodyLimitBytes: 1024 * 1024,
		Upstreams: map[config.ProtocolFamily]config.UpstreamConfig{
			config.ProtocolOpenAI: {BaseURL: upstreamURL},
		},
	}
}

func listenLocal(t *testing.T) net.Listener {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	return listener
}

func startGateway(t *testing.T, cfg config.Config) (string, func()) {
	t.Helper()
	listener := listenLocal(t)
	ctx, cancel := context.WithCancel(context.Background())
	result := make(chan error, 1)
	go func() { result <- run(ctx, cfg, listener) }()
	baseURL := "http://" + listener.Addr().String()
	response := getEventually(t, baseURL+"/healthz")
	require.NoError(t, response.Body.Close())
	return baseURL, func() {
		cancel()
		select {
		case err := <-result:
			require.NoError(t, err)
		case <-time.After(2 * time.Second):
			t.Fatal("gateway did not stop")
		}
	}
}

func getEventually(t *testing.T, target string) *http.Response {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for {
		response, err := http.Get(target)
		if err == nil {
			return response
		}
		if time.Now().After(deadline) {
			require.NoError(t, err)
		}
		time.Sleep(10 * time.Millisecond)
	}
}
