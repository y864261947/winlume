// Package config loads and validates runtime configuration for the Go gateway.
package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
)

const (
	defaultHost           = "127.0.0.1"
	defaultPort           = 4010
	defaultBodyLimitBytes = 50 * 1024 * 1024
)

var defaultTrustedProxyIPs = []string{"127.0.0.1", "::1"}

// BillingMode controls whether the gateway performs no billing, shadow writes,
// or authoritative quota and ledger mutation.
type BillingMode string

const (
	BillingOff           BillingMode = "off"
	BillingShadow        BillingMode = "shadow"
	BillingAuthoritative BillingMode = "authoritative"
)

// UpstreamOwnership declares whether an upstream can be used when Go is the
// authoritative billing owner.
type UpstreamOwnership string

const (
	OwnershipProvider          UpstreamOwnership = "provider"
	OwnershipNonChargingNewAPI UpstreamOwnership = "non_charging_new_api"
)

// ProtocolFamily identifies an upstream protocol adapter.
type ProtocolFamily string

const (
	ProtocolOpenAI     ProtocolFamily = "openai"
	ProtocolClaude     ProtocolFamily = "claude"
	ProtocolGemini     ProtocolFamily = "gemini"
	ProtocolImages     ProtocolFamily = "images"
	ProtocolAudio      ProtocolFamily = "audio"
	ProtocolEmbeddings ProtocolFamily = "embeddings"
	ProtocolRealtime   ProtocolFamily = "realtime"
	ProtocolTask       ProtocolFamily = "task"
	ProtocolMidjourney ProtocolFamily = "midjourney"
	ProtocolSuno       ProtocolFamily = "suno"
	ProtocolVideo      ProtocolFamily = "video"
)

var protocolFamilies = []ProtocolFamily{
	ProtocolOpenAI,
	ProtocolClaude,
	ProtocolGemini,
	ProtocolImages,
	ProtocolAudio,
	ProtocolEmbeddings,
	ProtocolRealtime,
	ProtocolTask,
	ProtocolMidjourney,
	ProtocolSuno,
	ProtocolVideo,
}

// UpstreamConfig describes one configured provider endpoint. Authorization is
// server-only configuration and must never be returned by an HTTP handler.
type UpstreamConfig struct {
	BaseURL       string
	Authorization string
}

// Config is the complete runtime configuration consumed by gateway startup.
// Load parses it; Validate enforces the selected billing mode's safety gates.
type Config struct {
	Host                    string
	Port                    int
	TrustedProxyIPs         []string
	BodyLimitBytes          int64
	CORSOrigins             []string
	InternalToken           string
	GatewayAdminToken       string
	DatabaseURL             string
	APIKeyHashes            []string
	AllowUnverifiedAPIKeys  bool
	UsePlatformDatabase     bool
	ReservationMicrocredits int64
	RequestCostMicrocredits int64
	BillingMode             BillingMode
	BillingOwner            string
	UpstreamOwnership       UpstreamOwnership
	RecoveryDir             string
	Upstreams               map[ProtocolFamily]UpstreamConfig
}

// Load reads gateway-specific environment configuration. It deliberately never
// reads NEW_API_URL because new-api may be retired after the migration.
func Load() (Config, error) {
	databaseURL := firstNonEmpty("DATABASE_URL")
	port, err := positiveInt("WINLUME_GATEWAY_PORT", firstNonEmpty("WINLUME_GATEWAY_PORT"), defaultPort)
	if err != nil {
		return Config{}, err
	}
	bodyLimitBytes, err := positiveInt64(
		"WINLUME_GATEWAY_BODY_LIMIT_BYTES",
		firstNonEmpty("WINLUME_GATEWAY_BODY_LIMIT_BYTES"),
		defaultBodyLimitBytes,
	)
	if err != nil {
		return Config{}, err
	}
	allowUnverifiedAPIKeys, err := booleanValue(
		"WINLUME_GATEWAY_ALLOW_UNVERIFIED_KEYS",
		firstNonEmpty("WINLUME_GATEWAY_ALLOW_UNVERIFIED_KEYS"),
		false,
	)
	if err != nil {
		return Config{}, err
	}
	usePlatformDatabase, err := booleanValue(
		"WINLUME_GATEWAY_USE_PLATFORM_DATABASE",
		firstNonEmpty("WINLUME_GATEWAY_USE_PLATFORM_DATABASE"),
		databaseURL != "",
	)
	if err != nil {
		return Config{}, err
	}
	reservationMicrocredits, err := nonNegativeInt64(
		"WINLUME_GATEWAY_RESERVATION_MICROCREDITS",
		firstNonEmpty("WINLUME_GATEWAY_RESERVATION_MICROCREDITS"),
		0,
	)
	if err != nil {
		return Config{}, err
	}
	requestCostMicrocredits, err := nonNegativeInt64(
		"WINLUME_GATEWAY_REQUEST_COST_MICROCREDITS",
		firstNonEmpty("WINLUME_GATEWAY_REQUEST_COST_MICROCREDITS"),
		0,
	)
	if err != nil {
		return Config{}, err
	}
	upstreams, err := loadUpstreams()
	if err != nil {
		return Config{}, err
	}

	trustedProxyIPs := parseList(firstNonEmpty("WINLUME_GATEWAY_TRUSTED_PROXY_IPS"))
	if len(trustedProxyIPs) == 0 {
		trustedProxyIPs = append([]string(nil), defaultTrustedProxyIPs...)
	}

	return Config{
		Host:                    firstNonEmptyOr(defaultHost, "WINLUME_GATEWAY_HOST"),
		Port:                    port,
		TrustedProxyIPs:         trustedProxyIPs,
		BodyLimitBytes:          bodyLimitBytes,
		CORSOrigins:             parseList(firstNonEmpty("WINLUME_GATEWAY_CORS_ORIGINS")),
		InternalToken:           firstNonEmpty("WINLUME_GATEWAY_INTERNAL_TOKEN", "WINLUME_GATEWAY_STUDIO_TOKEN"),
		GatewayAdminToken:       firstNonEmpty("WINLUME_GATEWAY_ADMIN_TOKEN"),
		DatabaseURL:             databaseURL,
		APIKeyHashes:            parseList(firstNonEmpty("WINLUME_GATEWAY_API_KEY_HASHES")),
		AllowUnverifiedAPIKeys:  allowUnverifiedAPIKeys,
		UsePlatformDatabase:     usePlatformDatabase,
		ReservationMicrocredits: reservationMicrocredits,
		RequestCostMicrocredits: requestCostMicrocredits,
		BillingMode:             BillingMode(firstNonEmptyOr(string(BillingShadow), "WINLUME_GATEWAY_BILLING_MODE")),
		BillingOwner:            firstNonEmpty("WINLUME_GATEWAY_BILLING_OWNER"),
		UpstreamOwnership:       UpstreamOwnership(firstNonEmpty("WINLUME_GATEWAY_UPSTREAM_OWNERSHIP")),
		RecoveryDir:             firstNonEmpty("WINLUME_GATEWAY_RECOVERY_DIR"),
		Upstreams:               upstreams,
	}, nil
}

// Validate checks configuration whose safety depends on the selected billing
// mode. It does not require an upstream because readiness owns that check.
func (cfg Config) Validate() error {
	if err := validateUpstreams(cfg.Upstreams); err != nil {
		return err
	}
	if cfg.UpstreamOwnership != "" && !isAllowedUpstreamOwnership(cfg.UpstreamOwnership) {
		return fmt.Errorf(
			"WINLUME_GATEWAY_UPSTREAM_OWNERSHIP must be %q or %q",
			OwnershipProvider,
			OwnershipNonChargingNewAPI,
		)
	}

	switch cfg.BillingMode {
	case BillingOff:
		return nil
	case BillingShadow:
		return validateDatabaseAndInternalToken(cfg)
	case BillingAuthoritative:
		if err := validateDatabaseAndInternalToken(cfg); err != nil {
			return err
		}
		if cfg.BillingOwner != "go" {
			return fmt.Errorf("authoritative billing requires WINLUME_GATEWAY_BILLING_OWNER=go")
		}
		if !isAllowedUpstreamOwnership(cfg.UpstreamOwnership) {
			return fmt.Errorf(
				"authoritative billing requires WINLUME_GATEWAY_UPSTREAM_OWNERSHIP=%q or %q",
				OwnershipProvider,
				OwnershipNonChargingNewAPI,
			)
		}
		if strings.TrimSpace(cfg.RecoveryDir) == "" {
			return fmt.Errorf("authoritative billing requires WINLUME_GATEWAY_RECOVERY_DIR")
		}
		return nil
	default:
		return fmt.Errorf("WINLUME_GATEWAY_BILLING_MODE must be %q, %q, or %q", BillingOff, BillingShadow, BillingAuthoritative)
	}
}

func validateDatabaseAndInternalToken(cfg Config) error {
	if strings.TrimSpace(cfg.DatabaseURL) == "" {
		return fmt.Errorf("%s billing requires DATABASE_URL", cfg.BillingMode)
	}
	if strings.TrimSpace(cfg.InternalToken) == "" {
		return fmt.Errorf("%s billing requires WINLUME_GATEWAY_INTERNAL_TOKEN", cfg.BillingMode)
	}
	return nil
}

func validateUpstreams(upstreams map[ProtocolFamily]UpstreamConfig) error {
	for family, upstream := range upstreams {
		if strings.TrimSpace(upstream.BaseURL) == "" {
			return fmt.Errorf("upstream %q must have a base URL", family)
		}
		if _, err := normalizeBaseURL(upstream.BaseURL, fmt.Sprintf("upstream %q", family)); err != nil {
			return err
		}
	}
	return nil
}

func loadUpstreams() (map[ProtocolFamily]UpstreamConfig, error) {
	sharedOpenAIURL, sharedOpenAIURLName := firstNonEmptyNamed(
		"WINLUME_GATEWAY_OPENAI_UPSTREAM_URL",
		"WINLUME_GATEWAY_OPENAI_BASE_URL",
		"WINLUME_GATEWAY_UPSTREAM_URL",
		"WINLUME_GATEWAY_BASE_URL",
	)
	upstreams := make(map[ProtocolFamily]UpstreamConfig)
	for _, family := range protocolFamilies {
		upstream, ok, err := upstreamFor(family, sharedOpenAIURL, sharedOpenAIURLName)
		if err != nil {
			return nil, err
		}
		if ok {
			upstreams[family] = upstream
		}
	}
	return upstreams, nil
}

func upstreamFor(family ProtocolFamily, sharedOpenAIURL, sharedOpenAIURLName string) (UpstreamConfig, bool, error) {
	suffix := familyEnvironmentSuffix(family)
	baseURL, envName := firstNonEmptyNamed(
		"WINLUME_GATEWAY_"+suffix+"_UPSTREAM_URL",
		"WINLUME_GATEWAY_"+suffix+"_BASE_URL",
	)
	if baseURL == "" && usesOpenAIURLFallback(family) {
		baseURL, envName = sharedOpenAIURL, sharedOpenAIURLName
	}
	if baseURL == "" {
		return UpstreamConfig{}, false, nil
	}
	normalized, err := normalizeBaseURL(baseURL, envName)
	if err != nil {
		return UpstreamConfig{}, false, err
	}
	return UpstreamConfig{
		BaseURL:       normalized,
		Authorization: authorizationForFamily(family),
	}, true, nil
}

func authorizationForFamily(family ProtocolFamily) string {
	suffix := familyEnvironmentSuffix(family)
	return firstNonEmpty(
		"WINLUME_GATEWAY_"+suffix+"_UPSTREAM_AUTHORIZATION",
		"WINLUME_GATEWAY_"+suffix+"_UPSTREAM_API_KEY",
		"WINLUME_GATEWAY_UPSTREAM_AUTHORIZATION",
		"WINLUME_GATEWAY_UPSTREAM_API_KEY",
		"WINLUME_GATEWAY_UPSTREAM_TOKEN",
	)
}

func usesOpenAIURLFallback(family ProtocolFamily) bool {
	switch family {
	case ProtocolOpenAI, ProtocolImages, ProtocolAudio, ProtocolEmbeddings, ProtocolRealtime:
		return true
	default:
		return false
	}
}

func normalizeBaseURL(value, envName string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil || parsed.Scheme == "" {
		return "", fmt.Errorf("%s must be an absolute URL", envName)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", fmt.Errorf("%s must use http or https", envName)
	}
	if parsed.Host == "" {
		return "", fmt.Errorf("%s must be an absolute URL", envName)
	}
	parsed.Fragment = ""
	parsed.Path = strings.TrimRight(parsed.Path, "/")
	parsed.RawPath = strings.TrimRight(parsed.RawPath, "/")
	return parsed.String(), nil
}

func positiveInt(envName, value string, fallback int) (int, error) {
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return 0, fmt.Errorf("%s must be a positive integer", envName)
	}
	return parsed, nil
}

func positiveInt64(envName, value string, fallback int64) (int64, error) {
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil || parsed <= 0 {
		return 0, fmt.Errorf("%s must be a positive integer", envName)
	}
	return parsed, nil
}

func nonNegativeInt64(envName, value string, fallback int64) (int64, error) {
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil || parsed < 0 {
		return 0, fmt.Errorf("%s must be a non-negative integer", envName)
	}
	return parsed, nil
}

func booleanValue(envName, value string, fallback bool) (bool, error) {
	if value == "" {
		return fallback, nil
	}
	switch strings.ToLower(value) {
	case "1", "true", "yes", "on":
		return true, nil
	case "0", "false", "no", "off":
		return false, nil
	default:
		return false, fmt.Errorf("%s must be a boolean", envName)
	}
}

func parseList(value string) []string {
	if value == "" {
		return nil
	}
	items := strings.Split(value, ",")
	result := make([]string, 0, len(items))
	for _, item := range items {
		if item = strings.TrimSpace(item); item != "" {
			result = append(result, item)
		}
	}
	return result
}

func firstNonEmpty(names ...string) string {
	value, _ := firstNonEmptyNamed(names...)
	return value
}

func firstNonEmptyOr(fallback string, names ...string) string {
	if value := firstNonEmpty(names...); value != "" {
		return value
	}
	return fallback
}

func firstNonEmptyNamed(names ...string) (string, string) {
	for _, name := range names {
		if value := strings.TrimSpace(os.Getenv(name)); value != "" {
			return value, name
		}
	}
	return "", ""
}

func familyEnvironmentSuffix(family ProtocolFamily) string {
	var suffix strings.Builder
	for _, character := range strings.ToUpper(string(family)) {
		if character >= 'A' && character <= 'Z' || character >= '0' && character <= '9' {
			suffix.WriteRune(character)
		} else {
			suffix.WriteByte('_')
		}
	}
	return suffix.String()
}

func isAllowedUpstreamOwnership(ownership UpstreamOwnership) bool {
	return ownership == OwnershipProvider || ownership == OwnershipNonChargingNewAPI
}

// KnownProtocolFamilies returns the full set of protocol family strings this
// gateway understands, for validating caller-supplied protocol_family values
// (e.g. in the channels admin API) against the same set env-var upstream
// configuration keys on.
func KnownProtocolFamilies() []string {
	families := make([]string, len(protocolFamilies))
	for i, family := range protocolFamilies {
		families[i] = string(family)
	}
	return families
}

// IsKnownProtocolFamily reports whether value matches one of
// KnownProtocolFamilies.
func IsKnownProtocolFamily(value string) bool {
	for _, family := range protocolFamilies {
		if string(family) == value {
			return true
		}
	}
	return false
}
