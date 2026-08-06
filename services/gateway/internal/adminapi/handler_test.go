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

	groupRules      []storage.GroupRuleRecord
	modelRules      []storage.ModelRuleRecord
	getPricingErr   error
	replaceGroupErr error
	replaceModelErr error
	lastGroupInputs []storage.GroupRuleInput
	lastModelInputs []storage.ModelRuleInput

	channels          []storage.ChannelRecord
	listChannelsErr   error
	createChannelErr  error
	updateChannelErr  error
	deleteChannelErr  error
	lastCreateChannel storage.ChannelInput
	lastUpdateChannel storage.ChannelInput
	lastUpdateID      uuid.UUID
	lastDeleteID      uuid.UUID
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

func (f *fakeStore) GetCurrentPricing(context.Context) ([]storage.GroupRuleRecord, []storage.ModelRuleRecord, error) {
	if f.getPricingErr != nil {
		return nil, nil, f.getPricingErr
	}
	return f.groupRules, f.modelRules, nil
}

func (f *fakeStore) ReplaceGroupRules(_ context.Context, rules []storage.GroupRuleInput) (uuid.UUID, error) {
	if f.replaceGroupErr != nil {
		return uuid.Nil, f.replaceGroupErr
	}
	f.lastGroupInputs = rules
	f.groupRules = make([]storage.GroupRuleRecord, 0, len(rules))
	for _, rule := range rules {
		f.groupRules = append(f.groupRules, storage.GroupRuleRecord{
			UserGroup:    rule.UserGroup,
			BillingGroup: rule.BillingGroup,
			GroupRatio:   rule.GroupRatio,
		})
	}
	return uuid.New(), nil
}

func (f *fakeStore) ReplaceModelRules(_ context.Context, rules []storage.ModelRuleInput) (uuid.UUID, error) {
	if f.replaceModelErr != nil {
		return uuid.Nil, f.replaceModelErr
	}
	f.lastModelInputs = rules
	f.modelRules = make([]storage.ModelRuleRecord, 0, len(rules))
	for _, rule := range rules {
		f.modelRules = append(f.modelRules, storage.ModelRuleRecord{
			ModelKey:   rule.ModelKey,
			Mode:       rule.Mode,
			ModelRatio: rule.ModelRatio,
		})
	}
	return uuid.New(), nil
}

func (f *fakeStore) ListChannels(context.Context) ([]storage.ChannelRecord, error) {
	if f.listChannelsErr != nil {
		return nil, f.listChannelsErr
	}
	return f.channels, nil
}

func (f *fakeStore) CreateChannel(_ context.Context, input storage.ChannelInput) (storage.ChannelRecord, error) {
	if f.createChannelErr != nil {
		return storage.ChannelRecord{}, f.createChannelErr
	}
	f.lastCreateChannel = input
	record := storage.ChannelRecord{ID: uuid.New()}
	if input.Name != nil {
		record.Name = *input.Name
	}
	if input.ProtocolFamily != nil {
		record.ProtocolFamily = *input.ProtocolFamily
	}
	if input.BaseURL != nil {
		record.BaseURL = *input.BaseURL
	}
	if input.APIKey != nil {
		record.APIKey = *input.APIKey
	}
	if input.Enabled != nil {
		record.Enabled = *input.Enabled
	} else {
		record.Enabled = true
	}
	if input.Priority != nil {
		record.Priority = *input.Priority
	}
	if input.Weight != nil {
		record.Weight = *input.Weight
	}
	record.Metadata = input.Metadata
	if record.Metadata == nil {
		record.Metadata = map[string]any{}
	}
	f.channels = append(f.channels, record)
	return record, nil
}

func (f *fakeStore) UpdateChannel(_ context.Context, id uuid.UUID, input storage.ChannelInput) (storage.ChannelRecord, error) {
	if f.updateChannelErr != nil {
		return storage.ChannelRecord{}, f.updateChannelErr
	}
	f.lastUpdateID = id
	f.lastUpdateChannel = input
	record := storage.ChannelRecord{ID: id, Name: "updated"}
	if input.Name != nil {
		record.Name = *input.Name
	}
	if input.APIKey != nil {
		record.APIKey = *input.APIKey
	}
	record.Metadata = map[string]any{}
	return record, nil
}

func (f *fakeStore) DeleteChannel(_ context.Context, id uuid.UUID) error {
	if f.deleteChannelErr != nil {
		return f.deleteChannelErr
	}
	f.lastDeleteID = id
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

func TestRevokeServiceAccountKeyNotFound(t *testing.T) {
	store := &fakeStore{revokeErr: storage.ErrServiceAccountNotFound}
	handler := NewHandler(store)

	request := httptest.NewRequest(http.MethodPost, "/internal/admin/service-accounts/"+uuid.New().String()+"/revoke", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNotFound, recorder.Code)
}
