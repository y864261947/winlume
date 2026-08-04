package identity

import "github.com/google/uuid"

// Source identifies the trusted authentication path used for a request.
type Source string

const (
	SourceStudio Source = "studio-internal"
	SourceAPIKey Source = "api-key"
)

// Identity contains only server-validated identifiers and non-secret display
// data. Raw API keys are never retained here.
type Identity struct {
	Source         Source
	UserID         uuid.UUID
	APIKeyID       *uuid.UUID
	OrganizationID *uuid.UUID
	APIKeyDisplay  string
}

// APIKeySource records which supported request header carried a credential.
type APIKeySource string

const (
	APIKeyAuthorization APIKeySource = "authorization"
	APIKeyHeader        APIKeySource = "x-api-key"
)

type apiKeyCredential struct {
	raw    string
	Source APIKeySource
}
