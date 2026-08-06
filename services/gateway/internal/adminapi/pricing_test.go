package adminapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"winlume/services/gateway/internal/storage"
)

func TestGetPricingReturnsCurrentRules(t *testing.T) {
	store := &fakeStore{
		groupRules: []storage.GroupRuleRecord{{UserGroup: "", BillingGroup: "default", GroupRatio: decimal.NewFromInt(1)}},
		modelRules: []storage.ModelRuleRecord{{ModelKey: "gpt-4o", Mode: "ratio"}},
	}
	handler := NewHandler(store)

	request := httptest.NewRequest(http.MethodGet, "/internal/admin/pricing", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code)
	var body struct {
		GroupRules []storage.GroupRuleRecord `json:"group_rules"`
		ModelRules []storage.ModelRuleRecord `json:"model_rules"`
	}
	require.NoError(t, json.NewDecoder(recorder.Body).Decode(&body))
	require.Len(t, body.GroupRules, 1)
	require.Len(t, body.ModelRules, 1)
	require.Equal(t, "default", body.GroupRules[0].BillingGroup)
}

func TestGetPricingNoActiveCatalog(t *testing.T) {
	store := &fakeStore{getPricingErr: storage.ErrNoActiveCatalog}
	handler := NewHandler(store)

	request := httptest.NewRequest(http.MethodGet, "/internal/admin/pricing", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusConflict, recorder.Code)
}

func TestPutGroupRulesReplacesAndReturnsRefreshedSet(t *testing.T) {
	store := &fakeStore{}
	handler := NewHandler(store)

	body := `{"group_rules":[{"user_group":"","billing_group":"default","group_ratio":"1.5"},{"user_group":"vip","billing_group":"premium","group_ratio":"0.8"}]}`
	request := httptest.NewRequest(http.MethodPut, "/internal/admin/pricing/group-rules", strings.NewReader(body))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Len(t, store.lastGroupInputs, 2)
	require.Equal(t, "default", store.lastGroupInputs[0].BillingGroup)
	require.True(t, decimal.RequireFromString("1.5").Equal(store.lastGroupInputs[0].GroupRatio))

	var resp struct {
		GroupRules []storage.GroupRuleRecord `json:"group_rules"`
	}
	require.NoError(t, json.NewDecoder(recorder.Body).Decode(&resp))
	require.Len(t, resp.GroupRules, 2)
}

func TestPutGroupRulesRejectsInvalidInput(t *testing.T) {
	store := &fakeStore{replaceGroupErr: storage.ErrInvalidPricingInput}
	handler := NewHandler(store)

	body := `{"group_rules":[{"user_group":"","billing_group":"","group_ratio":"1"}]}`
	request := httptest.NewRequest(http.MethodPut, "/internal/admin/pricing/group-rules", strings.NewReader(body))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
}

func TestPutGroupRulesRejectsInvalidJSON(t *testing.T) {
	store := &fakeStore{}
	handler := NewHandler(store)

	request := httptest.NewRequest(http.MethodPut, "/internal/admin/pricing/group-rules", strings.NewReader("not json"))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
}

func TestPutGroupRulesNoActiveCatalog(t *testing.T) {
	store := &fakeStore{replaceGroupErr: storage.ErrNoActiveCatalog}
	handler := NewHandler(store)

	body := `{"group_rules":[{"billing_group":"default","group_ratio":"1"}]}`
	request := httptest.NewRequest(http.MethodPut, "/internal/admin/pricing/group-rules", strings.NewReader(body))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusConflict, recorder.Code)
}

func TestPutModelRulesReplacesAndReturnsRefreshedSet(t *testing.T) {
	store := &fakeStore{}
	handler := NewHandler(store)

	body := `{"model_rules":[{"model_key":"gpt-4o","mode":"ratio","model_ratio":"2.5"}]}`
	request := httptest.NewRequest(http.MethodPut, "/internal/admin/pricing/model-rules", strings.NewReader(body))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Len(t, store.lastModelInputs, 1)
	require.Equal(t, "gpt-4o", store.lastModelInputs[0].ModelKey)
	require.NotNil(t, store.lastModelInputs[0].ModelRatio)
	require.True(t, decimal.RequireFromString("2.5").Equal(*store.lastModelInputs[0].ModelRatio))

	var resp struct {
		ModelRules []storage.ModelRuleRecord `json:"model_rules"`
	}
	require.NoError(t, json.NewDecoder(recorder.Body).Decode(&resp))
	require.Len(t, resp.ModelRules, 1)
}

func TestPutModelRulesRejectsInvalidInput(t *testing.T) {
	store := &fakeStore{replaceModelErr: storage.ErrInvalidPricingInput}
	handler := NewHandler(store)

	body := `{"model_rules":[{"model_key":"","mode":"ratio","model_ratio":"1"}]}`
	request := httptest.NewRequest(http.MethodPut, "/internal/admin/pricing/model-rules", strings.NewReader(body))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
}

func TestPutModelRulesPropagatesStorageUnavailable(t *testing.T) {
	store := &fakeStore{replaceModelErr: storage.ErrUnavailable}
	handler := NewHandler(store)

	body := `{"model_rules":[{"model_key":"gpt-4o","mode":"ratio","model_ratio":"1"}]}`
	request := httptest.NewRequest(http.MethodPut, "/internal/admin/pricing/model-rules", strings.NewReader(body))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusInternalServerError, recorder.Code)
}
