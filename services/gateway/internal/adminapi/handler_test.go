package adminapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"winlume/services/gateway/internal/storage"
)

type fakeStore struct {
	accounts    []storage.ServiceAccount
	updateErr   error
	revokeErr   error
	revokedID   uuid.UUID
	updateInput storage.UpdateServiceAccountPolicyInput
}

func (f *fakeStore) ListServiceAccounts(context.Context) ([]storage.ServiceAccount, error) {
	return f.accounts, nil
}

func (f *fakeStore) UpdateServiceAccountPolicy(_ context.Context, id uuid.UUID, input storage.UpdateServiceAccountPolicyInput) (storage.ServiceAccount, error) {
	if f.updateErr != nil {
		return storage.ServiceAccount{}, f.updateErr
	}
	f.updateInput = input
	return storage.ServiceAccount{APIKeyID: id, BillingGroup: input.BillingGroup, Unlimited: input.Unlimited, QuotaLimit: input.QuotaLimit}, nil
}

func (f *fakeStore) RevokeServiceAccountKey(_ context.Context, id uuid.UUID) error {
	if f.revokeErr != nil {
		return f.revokeErr
	}
	f.revokedID = id
	return nil
}

func TestListServiceAccounts(t *testing.T) {
	store := &fakeStore{accounts: []storage.ServiceAccount{{APIKeyID: uuid.New(), BillingGroup: "default"}}}
	handler := NewHandler(store)

	request := httptest.NewRequest(http.MethodGet, "/internal/admin/service-accounts", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code)
	var body struct {
		ServiceAccounts []storage.ServiceAccount `json:"service_accounts"`
	}
	require.NoError(t, json.NewDecoder(recorder.Body).Decode(&body))
	require.Len(t, body.ServiceAccounts, 1)
}

func TestUpdateServiceAccountPolicyRejectsInconsistentQuota(t *testing.T) {
	store := &fakeStore{}
	handler := NewHandler(store)

	id := uuid.New()
	request := httptest.NewRequest(http.MethodPatch, "/internal/admin/service-accounts/"+id.String(),
		strings.NewReader(`{"billing_group":"internal-apps","unlimited":true,"quota_limit":500000}`))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
}

func TestUpdateServiceAccountPolicyNotFound(t *testing.T) {
	store := &fakeStore{updateErr: storage.ErrServiceAccountNotFound}
	handler := NewHandler(store)

	id := uuid.New()
	request := httptest.NewRequest(http.MethodPatch, "/internal/admin/service-accounts/"+id.String(),
		strings.NewReader(`{"billing_group":"default","unlimited":true}`))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNotFound, recorder.Code)
}

func TestRevokeServiceAccountKey(t *testing.T) {
	store := &fakeStore{}
	handler := NewHandler(store)

	id := uuid.New()
	request := httptest.NewRequest(http.MethodPost, "/internal/admin/service-accounts/"+id.String()+"/revoke", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, id, store.revokedID)
}

func TestRevokeServiceAccountKeyPropagatesStorageUnavailable(t *testing.T) {
	store := &fakeStore{revokeErr: errors.New("boom")}
	handler := NewHandler(store)

	request := httptest.NewRequest(http.MethodPost, "/internal/admin/service-accounts/"+uuid.New().String()+"/revoke", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusInternalServerError, recorder.Code)
}
