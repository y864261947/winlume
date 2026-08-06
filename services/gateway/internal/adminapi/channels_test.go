package adminapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"winlume/services/gateway/internal/storage"
)

func TestListChannelsRedactsAPIKey(t *testing.T) {
	secret := "sk-super-secret-value"
	store := &fakeStore{channels: []storage.ChannelRecord{{
		ID: uuid.New(), Name: "primary-openai", ProtocolFamily: "openai",
		BaseURL: "https://api.openai.example", APIKey: secret, Enabled: true,
		Metadata: map[string]any{}, CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}}}
	handler := NewHandler(store)

	request := httptest.NewRequest(http.MethodGet, "/internal/admin/channels", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code)
	raw := recorder.Body.String()
	require.NotContains(t, raw, secret, "GET /internal/admin/channels must never leak api_key")

	var body struct {
		Channels []struct {
			ID        uuid.UUID `json:"id"`
			Name      string    `json:"name"`
			HasAPIKey bool      `json:"has_api_key"`
		} `json:"channels"`
	}
	require.NoError(t, json.NewDecoder(strings.NewReader(raw)).Decode(&body))
	require.Len(t, body.Channels, 1)
	require.True(t, body.Channels[0].HasAPIKey)
	require.Equal(t, "primary-openai", body.Channels[0].Name)
}

func TestListChannelsPropagatesStoreError(t *testing.T) {
	store := &fakeStore{listChannelsErr: storage.ErrUnavailable}
	handler := NewHandler(store)

	request := httptest.NewRequest(http.MethodGet, "/internal/admin/channels", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusInternalServerError, recorder.Code)
}

func TestCreateChannelEchoesSubmittedAPIKey(t *testing.T) {
	store := &fakeStore{}
	handler := NewHandler(store)

	body := `{"name":"primary-claude","protocol_family":"claude","base_url":"https://api.anthropic.example","api_key":"sk-abc123"}`
	request := httptest.NewRequest(http.MethodPost, "/internal/admin/channels", strings.NewReader(body))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusCreated, recorder.Code)
	require.NotNil(t, store.lastCreateChannel.Name)
	require.Equal(t, "primary-claude", *store.lastCreateChannel.Name)
	require.Equal(t, "claude", *store.lastCreateChannel.ProtocolFamily)
	require.Equal(t, "sk-abc123", *store.lastCreateChannel.APIKey)

	var resp struct {
		APIKey string `json:"api_key"`
	}
	require.NoError(t, json.NewDecoder(recorder.Body).Decode(&resp))
	require.Equal(t, "sk-abc123", resp.APIKey, "create response should echo back the just-submitted key")
}

func TestCreateChannelRejectsInvalidBody(t *testing.T) {
	store := &fakeStore{}
	handler := NewHandler(store)

	request := httptest.NewRequest(http.MethodPost, "/internal/admin/channels", strings.NewReader("not json"))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
}

func TestCreateChannelRejectsInvalidInput(t *testing.T) {
	store := &fakeStore{createChannelErr: storage.ErrInvalidChannelInput}
	handler := NewHandler(store)

	body := `{"name":"","protocol_family":"openai","base_url":"https://x","api_key":"k"}`
	request := httptest.NewRequest(http.MethodPost, "/internal/admin/channels", strings.NewReader(body))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
}

func TestUpdateChannelRedactsAPIKeyInResponse(t *testing.T) {
	store := &fakeStore{}
	handler := NewHandler(store)

	id := uuid.New()
	body := `{"api_key":"sk-rotated-secret"}`
	request := httptest.NewRequest(http.MethodPatch, "/internal/admin/channels/"+id.String(), strings.NewReader(body))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.NotContains(t, recorder.Body.String(), "sk-rotated-secret", "PATCH response must never leak api_key")
	require.Equal(t, id, store.lastUpdateID)
	require.NotNil(t, store.lastUpdateChannel.APIKey)
	require.Equal(t, "sk-rotated-secret", *store.lastUpdateChannel.APIKey)
}

func TestUpdateChannelRejectsInvalidID(t *testing.T) {
	store := &fakeStore{}
	handler := NewHandler(store)

	request := httptest.NewRequest(http.MethodPatch, "/internal/admin/channels/not-a-uuid", strings.NewReader(`{}`))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
}

func TestUpdateChannelNotFound(t *testing.T) {
	store := &fakeStore{updateChannelErr: storage.ErrChannelNotFound}
	handler := NewHandler(store)

	request := httptest.NewRequest(http.MethodPatch, "/internal/admin/channels/"+uuid.New().String(), strings.NewReader(`{}`))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNotFound, recorder.Code)
}

func TestDeleteChannel(t *testing.T) {
	store := &fakeStore{}
	handler := NewHandler(store)

	id := uuid.New()
	request := httptest.NewRequest(http.MethodDelete, "/internal/admin/channels/"+id.String(), nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, id, store.lastDeleteID)
}

func TestDeleteChannelNotFound(t *testing.T) {
	store := &fakeStore{deleteChannelErr: storage.ErrChannelNotFound}
	handler := NewHandler(store)

	request := httptest.NewRequest(http.MethodDelete, "/internal/admin/channels/"+uuid.New().String(), nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNotFound, recorder.Code)
}
