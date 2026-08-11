package adminapi

// Quick-edit pricing admin surface: GET the active catalog's group and model
// rules for display, PUT a full replacement set for one rule table. Every
// PUT is a full replace, not a patch - send the whole desired set. Storage
// (storage.ReplaceGroupRules / storage.ReplaceModelRules) does the
// clone-draft/edit/activate/retire dance in one transaction so the caller
// never has to think about catalog versioning; a failed PUT leaves the
// current active catalog completely untouched.
//
// Request bodies decode directly into storage.GroupRuleInput /
// storage.ModelRuleInput, whose fields are decimal.Decimal (or pointers to
// one). shopspring/decimal's default UnmarshalJSON accepts both a quoted
// string ("1.5") and a bare JSON number (1.5), and its default MarshalJSON
// always emits a quoted string, so responses are precision-safe strings
// without any hand-written parsing here.

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/google/uuid"

	"reizo/services/gateway/internal/storage"
)

// PricingStore is the storage surface the quick-edit pricing endpoints
// depend on, satisfied by *storage.Store in production and a fake in tests.
type PricingStore interface {
	GetCurrentPricing(ctx context.Context) ([]storage.GroupRuleRecord, []storage.ModelRuleRecord, error)
	ReplaceGroupRules(ctx context.Context, rules []storage.GroupRuleInput) (uuid.UUID, error)
	ReplaceModelRules(ctx context.Context, rules []storage.ModelRuleInput) (uuid.UUID, error)
}

func registerPricingRoutes(mux *http.ServeMux, store PricingStore) {
	mux.HandleFunc("GET /internal/admin/pricing", getPricingHandler(store))
	mux.HandleFunc("PUT /internal/admin/pricing/group-rules", putGroupRulesHandler(store))
	mux.HandleFunc("PUT /internal/admin/pricing/model-rules", putModelRulesHandler(store))
}

type pricingBody struct {
	GroupRules []storage.GroupRuleRecord `json:"group_rules"`
	ModelRules []storage.ModelRuleRecord `json:"model_rules"`
}

type groupRulesBody struct {
	GroupRules []storage.GroupRuleRecord `json:"group_rules"`
}

type modelRulesBody struct {
	ModelRules []storage.ModelRuleRecord `json:"model_rules"`
}

func getPricingHandler(store PricingStore) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		groupRules, modelRules, err := store.GetCurrentPricing(request.Context())
		if err != nil {
			writePricingLoadError(response, err)
			return
		}
		writeAdminJSON(response, http.StatusOK, pricingBody{GroupRules: groupRules, ModelRules: modelRules})
	}
}

type putGroupRulesRequest struct {
	GroupRules []storage.GroupRuleInput `json:"group_rules"`
}

func putGroupRulesHandler(store PricingStore) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		var body putGroupRulesRequest
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			writeAdminError(response, http.StatusBadRequest, "invalid_body", "The request body is not valid JSON")
			return
		}
		if _, err := store.ReplaceGroupRules(request.Context(), body.GroupRules); err != nil {
			writePricingWriteError(response, err)
			return
		}
		groupRules, _, err := store.GetCurrentPricing(request.Context())
		if err != nil {
			writePricingLoadError(response, err)
			return
		}
		writeAdminJSON(response, http.StatusOK, groupRulesBody{GroupRules: groupRules})
	}
}

type putModelRulesRequest struct {
	ModelRules []storage.ModelRuleInput `json:"model_rules"`
}

func putModelRulesHandler(store PricingStore) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		var body putModelRulesRequest
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			writeAdminError(response, http.StatusBadRequest, "invalid_body", "The request body is not valid JSON")
			return
		}
		if _, err := store.ReplaceModelRules(request.Context(), body.ModelRules); err != nil {
			writePricingWriteError(response, err)
			return
		}
		_, modelRules, err := store.GetCurrentPricing(request.Context())
		if err != nil {
			writePricingLoadError(response, err)
			return
		}
		writeAdminJSON(response, http.StatusOK, modelRulesBody{ModelRules: modelRules})
	}
}

func writePricingLoadError(response http.ResponseWriter, err error) {
	if errors.Is(err, storage.ErrNoActiveCatalog) {
		writeAdminError(response, http.StatusConflict, "no_active_catalog", "There is no active pricing catalog")
		return
	}
	writeAdminError(response, http.StatusInternalServerError, "pricing_load_failed", "Could not load the active pricing catalog")
}

func writePricingWriteError(response http.ResponseWriter, err error) {
	if errors.Is(err, storage.ErrInvalidPricingInput) {
		writeAdminError(response, http.StatusBadRequest, "invalid_pricing_input", err.Error())
		return
	}
	if errors.Is(err, storage.ErrNoActiveCatalog) {
		writeAdminError(response, http.StatusConflict, "no_active_catalog", "There is no active pricing catalog to edit")
		return
	}
	writeAdminError(response, http.StatusInternalServerError, "pricing_write_failed", "Could not save the pricing change")
}
