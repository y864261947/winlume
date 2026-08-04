package identity

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestStudioIdentityRequiresInternalToken(t *testing.T) {
	userID := uuid.New()
	request := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	request.Header.Set("New-Api-User", userID.String())
	request.Header.Set("x-winlume-user", userID.String())
	request.Header.Set("x-winlume-internal-user-id", userID.String())

	_, err := AuthenticateStudio(request, "server-secret")
	require.ErrorIs(t, err, ErrUnauthorized)

	request.Header.Set("x-winlume-internal-token", "wrong-secret")
	_, err = AuthenticateStudio(request, "server-secret")
	require.ErrorIs(t, err, ErrUnauthorized)
}

func TestStudioIdentityAcceptsValidatedUUIDAliasesAfterTokenCheck(t *testing.T) {
	userID := uuid.New()
	aliases := []string{
		"x-winlume-internal-user-id",
		"x-winlume-internal-identity",
		"x-winlume-internal-user",
		"x-winlume-user-id",
	}

	for _, alias := range aliases {
		t.Run(alias, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
			request.Header.Set("x-winlume-internal-token", "server-secret")
			request.Header.Set(alias, userID.String())

			actual, err := AuthenticateStudio(request, "server-secret")
			require.NoError(t, err)
			require.Equal(t, SourceStudio, actual.Source)
			require.Equal(t, userID, actual.UserID)
			require.Nil(t, actual.APIKeyID)
		})
	}
}

func TestStudioIdentityRejectsMissingOrMalformedUserID(t *testing.T) {
	for _, value := range []string{"", "authjs-user-7", uuid.Nil.String(), "bad\r\nidentity"} {
		t.Run(value, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
			request.Header.Set("x-winlume-internal-token", "server-secret")
			if value != "" {
				request.Header.Set("x-winlume-internal-user-id", value)
			}

			_, err := AuthenticateStudio(request, "server-secret")
			require.ErrorIs(t, err, ErrUnauthorized)
		})
	}
}

func TestAPIKeyExtractsBearerAndAlternateHeaders(t *testing.T) {
	testCases := []struct {
		name    string
		headers map[string]string
		value   string
		source  APIKeySource
		ok      bool
	}{
		{
			name:    "bearer",
			headers: map[string]string{"Authorization": "Bearer wl_test_secret"},
			value:   "wl_test_secret",
			source:  APIKeyAuthorization,
			ok:      true,
		},
		{
			name:    "x api key fallback after basic authorization",
			headers: map[string]string{"Authorization": "Basic dXNlcjpwYXNz", "x-api-key": "wl_fallback"},
			value:   "wl_fallback",
			source:  APIKeyHeader,
			ok:      true,
		},
		{
			name:    "legacy api key header",
			headers: map[string]string{"api-key": "wl_legacy"},
			value:   "wl_legacy",
			source:  APIKeyHeader,
			ok:      true,
		},
		{
			name:    "other authorization scheme",
			headers: map[string]string{"Authorization": "Token wl_nope"},
			ok:      false,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
			for name, value := range testCase.headers {
				request.Header.Set(name, value)
			}
			credential, ok := ExtractAPIKey(request)
			require.Equal(t, testCase.ok, ok)
			if ok {
				require.Equal(t, testCase.value, credential.raw)
				require.Equal(t, testCase.source, credential.Source)
			}
		})
	}
}

func TestAPIKeyAuthenticationHashesBeforeLookupAndDoesNotRetainRawKey(t *testing.T) {
	raw := "wl_1234567890abcdef"
	userID := uuid.New()
	apiKeyID := uuid.New()
	organizationID := uuid.New()
	lookup := &recordingLookup{identity: Identity{
		UserID:         userID,
		APIKeyID:       &apiKeyID,
		OrganizationID: &organizationID,
	}}
	request := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	request.Header.Set("Authorization", "Bearer "+raw)

	actual, err := AuthenticateAPIKey(request.Context(), request, lookup)
	require.NoError(t, err)
	require.Equal(t, HashAPIKey(raw), lookup.digest)
	require.NotEqual(t, raw, lookup.digest)
	require.Equal(t, SourceAPIKey, actual.Source)
	require.Equal(t, "wl_12345...cdef", actual.APIKeyDisplay)
	require.Equal(t, userID, actual.UserID)
	require.Equal(t, apiKeyID, *actual.APIKeyID)
	require.Equal(t, organizationID, *actual.OrganizationID)
}

func TestAPIKeyAuthenticationRejectsMissingInactiveAndUnavailableLookup(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	_, err := AuthenticateAPIKey(request.Context(), request, &recordingLookup{})
	require.ErrorIs(t, err, ErrUnauthorized)

	request.Header.Set("x-api-key", "wl_missing")
	_, err = AuthenticateAPIKey(request.Context(), request, &recordingLookup{err: ErrAPIKeyNotFound})
	require.ErrorIs(t, err, ErrUnauthorized)

	lookupFailure := errors.New("database unavailable")
	_, err = AuthenticateAPIKey(request.Context(), request, &recordingLookup{err: lookupFailure})
	require.ErrorIs(t, err, lookupFailure)
}

type recordingLookup struct {
	digest   string
	identity Identity
	err      error
}

func (lookup *recordingLookup) LookupAPIKey(_ context.Context, digest string) (Identity, error) {
	lookup.digest = digest
	return lookup.identity, lookup.err
}
