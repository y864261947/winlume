package adminapi

// Model Availability admin surface: list the active pricing catalog's
// model_availability rows and PATCH one row's enabled/priority/weight. See
// storage/model_availability_admin.go for why this is a direct read/update
// rather than the clone-draft/activate/retire dance pricing.go's quick-edit
// endpoints use - model_availability is intentionally left out of that
// versioned replace flow, so editing here just updates the existing row in
// place.

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/google/uuid"

	"winlume/services/gateway/internal/storage"
)

// ModelAvailabilityStore is the storage surface the model availability admin
// endpoints depend on, satisfied by *storage.Store in production and a fake
// in tests.
type ModelAvailabilityStore interface {
	ListModelAvailability(ctx context.Context) ([]storage.ModelAvailabilityRecord, error)
	UpdateModelAvailability(ctx context.Context, id uuid.UUID, input storage.ModelAvailabilityUpdateInput) (storage.ModelAvailabilityRecord, error)
}

func registerModelAvailabilityRoutes(mux *http.ServeMux, store ModelAvailabilityStore) {
	mux.HandleFunc("GET /internal/admin/model-availability", listModelAvailabilityHandler(store))
	mux.HandleFunc("PATCH /internal/admin/model-availability/{id}", updateModelAvailabilityHandler(store))
}

type listModelAvailabilityBody struct {
	ModelAvailability []storage.ModelAvailabilityRecord `json:"model_availability"`
}

func listModelAvailabilityHandler(store ModelAvailabilityStore) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		records, err := store.ListModelAvailability(request.Context())
		if err != nil {
			writeModelAvailabilityLoadError(response, err)
			return
		}
		writeAdminJSON(response, http.StatusOK, listModelAvailabilityBody{ModelAvailability: records})
	}
}

type updateModelAvailabilityRequest struct {
	Enabled  *bool `json:"enabled,omitempty"`
	Priority *int  `json:"priority,omitempty"`
	Weight   *int  `json:"weight,omitempty"`
}

func updateModelAvailabilityHandler(store ModelAvailabilityStore) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		id, err := uuid.Parse(request.PathValue("id"))
		if err != nil {
			writeAdminError(response, http.StatusBadRequest, "invalid_id", "The model availability id is not a valid UUID")
			return
		}
		var body updateModelAvailabilityRequest
		if decodeErr := json.NewDecoder(request.Body).Decode(&body); decodeErr != nil {
			writeAdminError(response, http.StatusBadRequest, "invalid_body", "The request body is not valid JSON")
			return
		}
		record, err := store.UpdateModelAvailability(request.Context(), id, storage.ModelAvailabilityUpdateInput{
			Enabled:  body.Enabled,
			Priority: body.Priority,
			Weight:   body.Weight,
		})
		if err != nil {
			writeModelAvailabilityWriteError(response, err)
			return
		}
		writeAdminJSON(response, http.StatusOK, record)
	}
}

func writeModelAvailabilityLoadError(response http.ResponseWriter, err error) {
	if errors.Is(err, storage.ErrNoActiveCatalog) {
		writeAdminError(response, http.StatusConflict, "no_active_catalog", "There is no active pricing catalog")
		return
	}
	writeAdminError(response, http.StatusInternalServerError, "model_availability_load_failed", "Could not list model availability")
}

func writeModelAvailabilityWriteError(response http.ResponseWriter, err error) {
	if errors.Is(err, storage.ErrInvalidModelAvailabilityInput) {
		writeAdminError(response, http.StatusBadRequest, "invalid_model_availability_input", err.Error())
		return
	}
	if errors.Is(err, storage.ErrModelAvailabilityNotFound) {
		writeAdminError(response, http.StatusNotFound, "model_availability_not_found", "No model availability row matches that id")
		return
	}
	writeAdminError(response, http.StatusInternalServerError, "model_availability_write_failed", "Could not save the model availability change")
}
