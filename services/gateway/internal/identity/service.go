package identity

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/google/uuid"
)

const internalTokenHeader = "x-winlume-internal-token"

var (
	ErrUnauthorized   = errors.New("unauthorized")
	ErrAPIKeyNotFound = errors.New("api key not found")

	bearerCredential    = regexp.MustCompile(`(?i)^Bearer\s+(\S+)$`)
	internalUserAliases = []string{
		"x-winlume-internal-user-id",
		"x-winlume-internal-identity",
		"x-winlume-internal-user",
		"x-winlume-user-id",
	}
)

// APIKeyLookup is implemented by storage. Its only credential input is a
// one-way lookup digest.
type APIKeyLookup interface {
	LookupAPIKey(context.Context, string) (Identity, error)
}

// AuthenticateStudio accepts identity headers only after the separate
// server-to-server token has passed a constant-time comparison.
func AuthenticateStudio(request *http.Request, configuredToken string) (Identity, error) {
	receivedToken := strings.TrimSpace(request.Header.Get(internalTokenHeader))
	if !secretEqual(configuredToken, receivedToken) {
		return Identity{}, ErrUnauthorized
	}

	var rawUserID string
	for _, name := range internalUserAliases {
		if value := strings.TrimSpace(request.Header.Get(name)); value != "" {
			rawUserID = value
			break
		}
	}
	userID, err := uuid.Parse(rawUserID)
	if err != nil || userID == uuid.Nil {
		return Identity{}, ErrUnauthorized
	}

	return Identity{Source: SourceStudio, UserID: userID}, nil
}

// ExtractAPIKey recognizes Bearer, x-api-key, and the existing api-key alias.
// The returned raw value is private to this package and is discarded after
// AuthenticateAPIKey computes its lookup digest.
func ExtractAPIKey(request *http.Request) (apiKeyCredential, bool) {
	authorization := strings.TrimSpace(request.Header.Get("Authorization"))
	if match := bearerCredential.FindStringSubmatch(authorization); len(match) == 2 {
		return apiKeyCredential{raw: match[1], Source: APIKeyAuthorization}, true
	}

	for _, name := range []string{"x-api-key", "api-key"} {
		if raw := strings.TrimSpace(request.Header.Get(name)); raw != "" {
			return apiKeyCredential{raw: raw, Source: APIKeyHeader}, true
		}
	}
	return apiKeyCredential{}, false
}

// AuthenticateAPIKey hashes the temporary raw credential before crossing the
// storage boundary.
func AuthenticateAPIKey(ctx context.Context, request *http.Request, lookup APIKeyLookup) (Identity, error) {
	credential, ok := ExtractAPIKey(request)
	if !ok || lookup == nil {
		return Identity{}, ErrUnauthorized
	}

	identity, err := lookup.LookupAPIKey(ctx, HashAPIKey(credential.raw))
	if errors.Is(err, ErrAPIKeyNotFound) {
		return Identity{}, ErrUnauthorized
	}
	if err != nil {
		return Identity{}, fmt.Errorf("lookup API key: %w", err)
	}
	if identity.UserID == uuid.Nil {
		return Identity{}, ErrUnauthorized
	}

	identity.Source = SourceAPIKey
	identity.APIKeyDisplay = FormatAPIKey(credential.raw)
	return identity, nil
}

// HashAPIKey is a lookup digest, not a password hash. The database stores this
// value and never stores the raw API key.
func HashAPIKey(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// FormatAPIKey returns the existing non-secret UI/log representation.
func FormatAPIKey(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if len(raw) <= 8 {
		limit := 3
		if len(raw) < limit {
			limit = len(raw)
		}
		return raw[:limit] + "..."
	}
	return raw[:8] + "..." + raw[len(raw)-4:]
}

func secretEqual(expected, received string) bool {
	if expected == "" || received == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(expected), []byte(received)) == 1
}
