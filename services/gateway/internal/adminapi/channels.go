package adminapi

// Channels admin surface: CRUD over the channels table, the connection-level
// relay configuration (name, protocol family, base URL, api key, selection
// weighting). This is config management only - nothing here affects live
// request routing; relay.StaticSelector is unchanged and keeps sourcing
// upstreams from env vars. A separate, explicitly approved follow-up task
// will wire StaticSelector to read from this table.
//
// api_key is never returned by GET/list or PATCH: those responses carry
// has_api_key (always true, since the column is NOT NULL) instead of the
// secret. POST/create echoes back the api_key the caller just submitted,
// since no new secret is being revealed there - the caller already has it.

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/google/uuid"

	"winlume/services/gateway/internal/storage"
)

// ChannelStore is the storage surface the channels admin endpoints depend
// on, satisfied by *storage.Store in production and a fake in tests.
type ChannelStore interface {
	ListChannels(ctx context.Context) ([]storage.ChannelRecord, error)
	CreateChannel(ctx context.Context, input storage.ChannelInput) (storage.ChannelRecord, error)
	UpdateChannel(ctx context.Context, id uuid.UUID, input storage.ChannelInput) (storage.ChannelRecord, error)
	DeleteChannel(ctx context.Context, id uuid.UUID) error
}

func registerChannelRoutes(mux *http.ServeMux, store ChannelStore) {
	mux.HandleFunc("GET /internal/admin/channels", listChannelsHandler(store))
	mux.HandleFunc("POST /internal/admin/channels", createChannelHandler(store))
	mux.HandleFunc("PATCH /internal/admin/channels/{id}", updateChannelHandler(store))
	mux.HandleFunc("DELETE /internal/admin/channels/{id}", deleteChannelHandler(store))
}

// redactedChannel is the shape returned by GET/list and PATCH: the api_key
// field is dropped entirely and replaced with a boolean presence flag so a
// caller can tell a channel is configured without ever seeing the secret
// again after creation.
type redactedChannel struct {
	ID             uuid.UUID      `json:"id"`
	Name           string         `json:"name"`
	ProtocolFamily string         `json:"protocol_family"`
	BaseURL        string         `json:"base_url"`
	HasAPIKey      bool           `json:"has_api_key"`
	Enabled        bool           `json:"enabled"`
	Priority       int            `json:"priority"`
	Weight         int            `json:"weight"`
	Metadata       map[string]any `json:"metadata"`
	CreatedAt      string         `json:"created_at"`
	UpdatedAt      string         `json:"updated_at"`
}

func redactChannel(record storage.ChannelRecord) redactedChannel {
	return redactedChannel{
		ID:             record.ID,
		Name:           record.Name,
		ProtocolFamily: record.ProtocolFamily,
		BaseURL:        record.BaseURL,
		HasAPIKey:      record.APIKey != "",
		Enabled:        record.Enabled,
		Priority:       record.Priority,
		Weight:         record.Weight,
		Metadata:       record.Metadata,
		CreatedAt:      record.CreatedAt.Format(rfc3339Milli),
		UpdatedAt:      record.UpdatedAt.Format(rfc3339Milli),
	}
}

const rfc3339Milli = "2006-01-02T15:04:05.000Z07:00"

type listChannelsBody struct {
	Channels []redactedChannel `json:"channels"`
}

func listChannelsHandler(store ChannelStore) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		records, err := store.ListChannels(request.Context())
		if err != nil {
			writeAdminError(response, http.StatusInternalServerError, "list_failed", "Could not list channels")
			return
		}
		body := listChannelsBody{Channels: make([]redactedChannel, 0, len(records))}
		for _, record := range records {
			body.Channels = append(body.Channels, redactChannel(record))
		}
		writeAdminJSON(response, http.StatusOK, body)
	}
}

// createChannelRequest mirrors storage.ChannelInput's fields, but Name,
// ProtocolFamily, BaseURL, and APIKey are declared as plain strings (not
// pointers) since create requires all of them; storage.validateChannelInputForCreate
// still re-checks presence server-side.
type createChannelRequest struct {
	Name           string         `json:"name"`
	ProtocolFamily string         `json:"protocol_family"`
	BaseURL        string         `json:"base_url"`
	APIKey         string         `json:"api_key"`
	Enabled        *bool          `json:"enabled,omitempty"`
	Priority       *int           `json:"priority,omitempty"`
	Weight         *int           `json:"weight,omitempty"`
	Metadata       map[string]any `json:"metadata,omitempty"`
}

// createChannelResponse echoes the api_key the caller just submitted -
// unlike the redacted GET/PATCH shape, this is not a new secret being
// revealed, just confirmation of what was written.
type createChannelResponse struct {
	ID             uuid.UUID      `json:"id"`
	Name           string         `json:"name"`
	ProtocolFamily string         `json:"protocol_family"`
	BaseURL        string         `json:"base_url"`
	APIKey         string         `json:"api_key"`
	Enabled        bool           `json:"enabled"`
	Priority       int            `json:"priority"`
	Weight         int            `json:"weight"`
	Metadata       map[string]any `json:"metadata"`
	CreatedAt      string         `json:"created_at"`
	UpdatedAt      string         `json:"updated_at"`
}

func createChannelHandler(store ChannelStore) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		var body createChannelRequest
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			writeAdminError(response, http.StatusBadRequest, "invalid_body", "The request body is not valid JSON")
			return
		}
		record, err := store.CreateChannel(request.Context(), storage.ChannelInput{
			Name:           &body.Name,
			ProtocolFamily: &body.ProtocolFamily,
			BaseURL:        &body.BaseURL,
			APIKey:         &body.APIKey,
			Enabled:        body.Enabled,
			Priority:       body.Priority,
			Weight:         body.Weight,
			Metadata:       body.Metadata,
		})
		if err != nil {
			writeChannelWriteError(response, err)
			return
		}
		writeAdminJSON(response, http.StatusCreated, createChannelResponse{
			ID: record.ID, Name: record.Name, ProtocolFamily: record.ProtocolFamily,
			BaseURL: record.BaseURL, APIKey: record.APIKey, Enabled: record.Enabled,
			Priority: record.Priority, Weight: record.Weight, Metadata: record.Metadata,
			CreatedAt: record.CreatedAt.Format(rfc3339Milli), UpdatedAt: record.UpdatedAt.Format(rfc3339Milli),
		})
	}
}

// updateChannelRequest is a partial patch: only fields present (non-nil) are
// applied by storage.UpdateChannel.
type updateChannelRequest struct {
	Name           *string        `json:"name,omitempty"`
	ProtocolFamily *string        `json:"protocol_family,omitempty"`
	BaseURL        *string        `json:"base_url,omitempty"`
	APIKey         *string        `json:"api_key,omitempty"`
	Enabled        *bool          `json:"enabled,omitempty"`
	Priority       *int           `json:"priority,omitempty"`
	Weight         *int           `json:"weight,omitempty"`
	Metadata       map[string]any `json:"metadata,omitempty"`
}

func updateChannelHandler(store ChannelStore) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		id, err := uuid.Parse(request.PathValue("id"))
		if err != nil {
			writeAdminError(response, http.StatusBadRequest, "invalid_id", "The channel id is not a valid UUID")
			return
		}
		var body updateChannelRequest
		if decodeErr := json.NewDecoder(request.Body).Decode(&body); decodeErr != nil {
			writeAdminError(response, http.StatusBadRequest, "invalid_body", "The request body is not valid JSON")
			return
		}
		record, err := store.UpdateChannel(request.Context(), id, storage.ChannelInput{
			Name:           body.Name,
			ProtocolFamily: body.ProtocolFamily,
			BaseURL:        body.BaseURL,
			APIKey:         body.APIKey,
			Enabled:        body.Enabled,
			Priority:       body.Priority,
			Weight:         body.Weight,
			Metadata:       body.Metadata,
		})
		if err != nil {
			writeChannelWriteError(response, err)
			return
		}
		writeAdminJSON(response, http.StatusOK, redactChannel(record))
	}
}

func deleteChannelHandler(store ChannelStore) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		id, err := uuid.Parse(request.PathValue("id"))
		if err != nil {
			writeAdminError(response, http.StatusBadRequest, "invalid_id", "The channel id is not a valid UUID")
			return
		}
		if deleteErr := store.DeleteChannel(request.Context(), id); deleteErr != nil {
			if errors.Is(deleteErr, storage.ErrChannelNotFound) {
				writeAdminError(response, http.StatusNotFound, "channel_not_found", "No channel matches that id")
				return
			}
			writeAdminError(response, http.StatusInternalServerError, "delete_failed", "Could not delete the channel")
			return
		}
		writeAdminJSON(response, http.StatusOK, map[string]string{"status": "deleted"})
	}
}

func writeChannelWriteError(response http.ResponseWriter, err error) {
	if errors.Is(err, storage.ErrInvalidChannelInput) {
		writeAdminError(response, http.StatusBadRequest, "invalid_channel_input", err.Error())
		return
	}
	if errors.Is(err, storage.ErrChannelNotFound) {
		writeAdminError(response, http.StatusNotFound, "channel_not_found", "No channel matches that id")
		return
	}
	writeAdminError(response, http.StatusInternalServerError, "channel_write_failed", "Could not save the channel")
}
