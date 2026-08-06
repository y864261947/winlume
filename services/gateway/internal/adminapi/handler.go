// Package adminapi implements the gateway's operator-only HTTP surface for
// listing, quota-editing, and revoking internal-application service-account
// keys. It is mounted behind a separate shared-secret gate
// (WINLUME_GATEWAY_ADMIN_TOKEN) by httpapi.Server, never on the public route
// surface. See docs/superpowers/specs/2026-08-06-gateway-service-accounts-design.md.
package adminapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"winlume/services/gateway/internal/httpapi"
	"winlume/services/gateway/internal/storage"
)

// Store is the narrow storage surface this package depends on, satisfied by
// *storage.Store in production and a fake in tests. It embeds PricingStore
// so a single fake can satisfy both the service-account and quick-edit
// pricing surfaces.
type Store interface {
	ListServiceAccounts(ctx context.Context) ([]storage.ServiceAccount, error)
	UpdateServiceAccountPolicy(ctx context.Context, apiKeyID uuid.UUID, input storage.UpdateServiceAccountPolicyInput) (storage.ServiceAccount, error)
	RevokeServiceAccountKey(ctx context.Context, apiKeyID uuid.UUID) error
	PricingStore
	ChannelStore
}

// NewHandler builds the /internal/admin/* mux (service accounts and quick-
// edit pricing). Callers mount it behind their own token check; this
// handler performs no auth itself.
func NewHandler(store Store) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /internal/admin/service-accounts", listHandler(store))
	mux.HandleFunc("PATCH /internal/admin/service-accounts/{id}", updateHandler(store))
	mux.HandleFunc("POST /internal/admin/service-accounts/{id}/revoke", revokeHandler(store))
	registerPricingRoutes(mux, store)
	registerChannelRoutes(mux, store)
	return mux
}

type listBody struct {
	ServiceAccounts []storage.ServiceAccount `json:"service_accounts"`
}

func listHandler(store Store) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		accounts, err := store.ListServiceAccounts(request.Context())
		if err != nil {
			writeAdminError(response, http.StatusInternalServerError, "list_failed", "Could not list service accounts")
			return
		}
		writeAdminJSON(response, http.StatusOK, listBody{ServiceAccounts: accounts})
	}
}

type updatePolicyRequest struct {
	BillingGroup string `json:"billing_group"`
	Unlimited    bool   `json:"unlimited"`
	QuotaLimit   *int64 `json:"quota_limit"`
}

func updateHandler(store Store) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		id, err := uuid.Parse(request.PathValue("id"))
		if err != nil {
			writeAdminError(response, http.StatusBadRequest, "invalid_id", "The service account id is not a valid UUID")
			return
		}
		var body updatePolicyRequest
		if decodeErr := json.NewDecoder(request.Body).Decode(&body); decodeErr != nil {
			writeAdminError(response, http.StatusBadRequest, "invalid_body", "The request body is not valid JSON")
			return
		}
		if strings.TrimSpace(body.BillingGroup) == "" {
			writeAdminError(response, http.StatusBadRequest, "invalid_billing_group", "billing_group is required")
			return
		}
		if body.Unlimited && body.QuotaLimit != nil {
			writeAdminError(response, http.StatusBadRequest, "inconsistent_quota", "unlimited accounts must not set quota_limit")
			return
		}
		if !body.Unlimited && (body.QuotaLimit == nil || *body.QuotaLimit < 0) {
			writeAdminError(response, http.StatusBadRequest, "inconsistent_quota", "quota_limit is required and must be >= 0 unless unlimited is true")
			return
		}

		account, err := store.UpdateServiceAccountPolicy(request.Context(), id, storage.UpdateServiceAccountPolicyInput{
			BillingGroup: body.BillingGroup,
			Unlimited:    body.Unlimited,
			QuotaLimit:   body.QuotaLimit,
		})
		if errors.Is(err, storage.ErrServiceAccountNotFound) {
			writeAdminError(response, http.StatusNotFound, "service_account_not_found", "No service account key matches that id")
			return
		}
		if err != nil {
			writeAdminError(response, http.StatusInternalServerError, "update_failed", "Could not update the service account policy")
			return
		}
		writeAdminJSON(response, http.StatusOK, account)
	}
}

func revokeHandler(store Store) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		id, err := uuid.Parse(request.PathValue("id"))
		if err != nil {
			writeAdminError(response, http.StatusBadRequest, "invalid_id", "The service account id is not a valid UUID")
			return
		}
		if revokeErr := store.RevokeServiceAccountKey(request.Context(), id); revokeErr != nil {
			if errors.Is(revokeErr, storage.ErrServiceAccountNotFound) {
				writeAdminError(response, http.StatusNotFound, "service_account_not_found", "No service account key matches that id")
				return
			}
			writeAdminError(response, http.StatusInternalServerError, "revoke_failed", "Could not revoke the service account key")
			return
		}
		writeAdminJSON(response, http.StatusOK, map[string]string{"status": "revoked"})
	}
}

func writeAdminJSON(response http.ResponseWriter, status int, body any) {
	response.Header().Set("Content-Type", "application/json")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(body)
}

func writeAdminError(response http.ResponseWriter, status int, code, message string) {
	httpapi.WriteError(response, status, "admin_error", code, message, response.Header().Get("x-request-id"))
}
