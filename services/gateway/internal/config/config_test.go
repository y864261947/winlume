package config

import (
	"testing"

	"github.com/stretchr/testify/require"
)

var gatewayEnvironmentNames = func() []string {
	names := []string{
		"NEW_API_URL",
		"DATABASE_URL",
		"WINLUME_GATEWAY_HOST",
		"WINLUME_GATEWAY_PORT",
		"WINLUME_GATEWAY_TRUSTED_PROXY_IPS",
		"WINLUME_GATEWAY_BODY_LIMIT_BYTES",
		"WINLUME_GATEWAY_CORS_ORIGINS",
		"WINLUME_GATEWAY_INTERNAL_TOKEN",
		"WINLUME_GATEWAY_STUDIO_TOKEN",
		"WINLUME_GATEWAY_API_KEY_HASHES",
		"WINLUME_GATEWAY_ALLOW_UNVERIFIED_KEYS",
		"WINLUME_GATEWAY_USE_PLATFORM_DATABASE",
		"WINLUME_GATEWAY_RESERVATION_MICROCREDITS",
		"WINLUME_GATEWAY_REQUEST_COST_MICROCREDITS",
		"WINLUME_GATEWAY_BILLING_MODE",
		"WINLUME_GATEWAY_BILLING_OWNER",
		"WINLUME_GATEWAY_UPSTREAM_OWNERSHIP",
		"WINLUME_GATEWAY_RECOVERY_DIR",
		"WINLUME_GATEWAY_UPSTREAM_URL",
		"WINLUME_GATEWAY_BASE_URL",
		"WINLUME_GATEWAY_UPSTREAM_AUTHORIZATION",
		"WINLUME_GATEWAY_UPSTREAM_API_KEY",
		"WINLUME_GATEWAY_UPSTREAM_TOKEN",
	}

	for _, family := range protocolFamilies {
		suffix := familyEnvironmentSuffix(family)
		names = append(names,
			"WINLUME_GATEWAY_"+suffix+"_UPSTREAM_URL",
			"WINLUME_GATEWAY_"+suffix+"_BASE_URL",
			"WINLUME_GATEWAY_"+suffix+"_UPSTREAM_AUTHORIZATION",
			"WINLUME_GATEWAY_"+suffix+"_UPSTREAM_API_KEY",
		)
	}

	return names
}()

func clearGatewayEnvironment(t *testing.T) {
	t.Helper()
	for _, name := range gatewayEnvironmentNames {
		t.Setenv(name, "")
	}
}

func TestLoadDefaults(t *testing.T) {
	clearGatewayEnvironment(t)

	cfg, err := Load()
	require.NoError(t, err)
	require.Equal(t, "127.0.0.1", cfg.Host)
	require.Equal(t, 4010, cfg.Port)
	require.Equal(t, int64(50*1024*1024), cfg.BodyLimitBytes)
	require.Equal(t, []string{"127.0.0.1", "::1"}, cfg.TrustedProxyIPs)
	require.Empty(t, cfg.CORSOrigins)
	require.Empty(t, cfg.Upstreams)
	require.Equal(t, BillingShadow, cfg.BillingMode)
	require.False(t, cfg.UsePlatformDatabase)
	require.False(t, cfg.AllowUnverifiedAPIKeys)
}

func TestLoadBillingModes(t *testing.T) {
	testCases := []struct {
		name        string
		environment map[string]string
		mode        BillingMode
		ownership   UpstreamOwnership
	}{
		{
			name:        "off",
			environment: map[string]string{"WINLUME_GATEWAY_BILLING_MODE": "off"},
			mode:        BillingOff,
		},
		{
			name: "shadow",
			environment: map[string]string{
				"WINLUME_GATEWAY_BILLING_MODE":   "shadow",
				"DATABASE_URL":                   "postgres://db",
				"WINLUME_GATEWAY_INTERNAL_TOKEN": "secret",
			},
			mode: BillingShadow,
		},
		{
			name: "authoritative",
			environment: map[string]string{
				"WINLUME_GATEWAY_BILLING_MODE":       "authoritative",
				"DATABASE_URL":                       "postgres://db",
				"WINLUME_GATEWAY_INTERNAL_TOKEN":     "secret",
				"WINLUME_GATEWAY_BILLING_OWNER":      "go",
				"WINLUME_GATEWAY_UPSTREAM_OWNERSHIP": "non_charging_new_api",
				"WINLUME_GATEWAY_RECOVERY_DIR":       "C:/secure/gateway-recovery",
			},
			mode:      BillingAuthoritative,
			ownership: OwnershipNonChargingNewAPI,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			clearGatewayEnvironment(t)
			for name, value := range testCase.environment {
				t.Setenv(name, value)
			}

			cfg, err := Load()
			require.NoError(t, err)
			require.Equal(t, testCase.mode, cfg.BillingMode)
			require.Equal(t, testCase.ownership, cfg.UpstreamOwnership)
			if testCase.mode == BillingShadow {
				require.True(t, cfg.UsePlatformDatabase)
			}
			require.NoError(t, cfg.Validate())
		})
	}
}

func TestLoadConfiguredGatewayEnvironment(t *testing.T) {
	clearGatewayEnvironment(t)
	t.Setenv("WINLUME_GATEWAY_HOST", "0.0.0.0")
	t.Setenv("WINLUME_GATEWAY_PORT", "5010")
	t.Setenv("WINLUME_GATEWAY_BODY_LIMIT_BYTES", "1048576")
	t.Setenv("WINLUME_GATEWAY_TRUSTED_PROXY_IPS", "127.0.0.1, 10.0.0.0/8")
	t.Setenv("WINLUME_GATEWAY_CORS_ORIGINS", "https://studio.example, https://console.example")
	t.Setenv("WINLUME_GATEWAY_STUDIO_TOKEN", "studio-token")
	t.Setenv("DATABASE_URL", "postgres://gateway:secret@db.example/winlume")
	t.Setenv("WINLUME_GATEWAY_USE_PLATFORM_DATABASE", "false")
	t.Setenv("WINLUME_GATEWAY_API_KEY_HASHES", "hash-one, hash-two")
	t.Setenv("WINLUME_GATEWAY_ALLOW_UNVERIFIED_KEYS", "yes")
	t.Setenv("WINLUME_GATEWAY_BILLING_MODE", "off")
	t.Setenv("WINLUME_GATEWAY_OPENAI_BASE_URL", "https://provider.example/v1/#fragment")
	t.Setenv("WINLUME_GATEWAY_OPENAI_UPSTREAM_API_KEY", "openai-key")
	t.Setenv("WINLUME_GATEWAY_CLAUDE_UPSTREAM_URL", "https://claude.example/v1/")
	t.Setenv("WINLUME_GATEWAY_CLAUDE_UPSTREAM_AUTHORIZATION", "Bearer claude-token")

	cfg, err := Load()
	require.NoError(t, err)
	require.Equal(t, "0.0.0.0", cfg.Host)
	require.Equal(t, 5010, cfg.Port)
	require.Equal(t, int64(1048576), cfg.BodyLimitBytes)
	require.Equal(t, []string{"127.0.0.1", "10.0.0.0/8"}, cfg.TrustedProxyIPs)
	require.Equal(t, []string{"https://studio.example", "https://console.example"}, cfg.CORSOrigins)
	require.Equal(t, "studio-token", cfg.InternalToken)
	require.Equal(t, "postgres://gateway:secret@db.example/winlume", cfg.DatabaseURL)
	require.False(t, cfg.UsePlatformDatabase)
	require.Equal(t, []string{"hash-one", "hash-two"}, cfg.APIKeyHashes)
	require.True(t, cfg.AllowUnverifiedAPIKeys)
	require.Equal(t, BillingOff, cfg.BillingMode)
	require.Equal(t, "https://provider.example/v1", cfg.Upstreams[ProtocolOpenAI].BaseURL)
	require.Equal(t, "openai-key", cfg.Upstreams[ProtocolOpenAI].Authorization)
	for _, family := range []ProtocolFamily{ProtocolImages, ProtocolAudio, ProtocolEmbeddings, ProtocolRealtime} {
		require.Equal(t, "https://provider.example/v1", cfg.Upstreams[family].BaseURL)
		require.Empty(t, cfg.Upstreams[family].Authorization)
	}
	require.Equal(t, "https://claude.example/v1", cfg.Upstreams[ProtocolClaude].BaseURL)
	require.Equal(t, "Bearer claude-token", cfg.Upstreams[ProtocolClaude].Authorization)
	require.NoError(t, cfg.Validate())
}

func TestLoadFamilySpecificUpstreams(t *testing.T) {
	clearGatewayEnvironment(t)
	families := []struct {
		family ProtocolFamily
		suffix string
	}{
		{family: ProtocolOpenAI, suffix: "OPENAI"},
		{family: ProtocolClaude, suffix: "CLAUDE"},
		{family: ProtocolGemini, suffix: "GEMINI"},
		{family: ProtocolImages, suffix: "IMAGES"},
		{family: ProtocolAudio, suffix: "AUDIO"},
		{family: ProtocolEmbeddings, suffix: "EMBEDDINGS"},
		{family: ProtocolRealtime, suffix: "REALTIME"},
		{family: ProtocolTask, suffix: "TASK"},
		{family: ProtocolMidjourney, suffix: "MIDJOURNEY"},
		{family: ProtocolSuno, suffix: "SUNO"},
		{family: ProtocolVideo, suffix: "VIDEO"},
	}
	for _, family := range families {
		t.Setenv("WINLUME_GATEWAY_"+family.suffix+"_UPSTREAM_URL", "https://"+string(family.family)+".example/v1/")
		t.Setenv("WINLUME_GATEWAY_"+family.suffix+"_UPSTREAM_AUTHORIZATION", "Bearer "+string(family.family))
	}

	cfg, err := Load()
	require.NoError(t, err)
	require.Len(t, cfg.Upstreams, len(families))
	for _, family := range families {
		upstream, ok := cfg.Upstreams[family.family]
		require.True(t, ok, "%s upstream should be configured", family.family)
		require.Equal(t, "https://"+string(family.family)+".example/v1", upstream.BaseURL)
		require.Equal(t, "Bearer "+string(family.family), upstream.Authorization)
	}
}

func TestLoadDoesNotUseNewAPIURL(t *testing.T) {
	clearGatewayEnvironment(t)
	t.Setenv("NEW_API_URL", "https://retired.example")

	cfg, err := Load()
	require.NoError(t, err)
	require.Empty(t, cfg.Upstreams)
}

func TestLoadRejectsInvalidExplicitValues(t *testing.T) {
	testCases := []struct {
		name    string
		envName string
		value   string
		want    string
	}{
		{name: "port is not positive", envName: "WINLUME_GATEWAY_PORT", value: "0", want: "WINLUME_GATEWAY_PORT must be a positive integer"},
		{name: "body limit is not numeric", envName: "WINLUME_GATEWAY_BODY_LIMIT_BYTES", value: "many", want: "WINLUME_GATEWAY_BODY_LIMIT_BYTES must be a positive integer"},
		{name: "boolean is unknown", envName: "WINLUME_GATEWAY_ALLOW_UNVERIFIED_KEYS", value: "sometimes", want: "WINLUME_GATEWAY_ALLOW_UNVERIFIED_KEYS must be a boolean"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			clearGatewayEnvironment(t)
			t.Setenv(testCase.envName, testCase.value)

			_, err := Load()
			require.ErrorContains(t, err, testCase.want)
		})
	}
}

func TestLoadRejectsInvalidUpstreamURLs(t *testing.T) {
	testCases := []struct {
		name  string
		value string
		want  string
	}{
		{name: "unsupported scheme", value: "file:///tmp/provider", want: "must use http or https"},
		{name: "missing host", value: "https:///v1", want: "must be an absolute URL"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			clearGatewayEnvironment(t)
			t.Setenv("WINLUME_GATEWAY_OPENAI_UPSTREAM_URL", testCase.value)

			_, err := Load()
			require.ErrorContains(t, err, "WINLUME_GATEWAY_OPENAI_UPSTREAM_URL")
			require.ErrorContains(t, err, testCase.want)
		})
	}
}

func TestValidateBillingModes(t *testing.T) {
	testCases := []struct {
		name string
		cfg  Config
	}{
		{
			name: "off does not require billing infrastructure",
			cfg:  Config{BillingMode: BillingOff},
		},
		{
			name: "shadow requires the billing database and an internal token",
			cfg: Config{
				BillingMode:   BillingShadow,
				DatabaseURL:   "postgres://db",
				InternalToken: "secret",
			},
		},
		{
			name: "authoritative requires declared provider ownership",
			cfg: Config{
				BillingMode:       BillingAuthoritative,
				DatabaseURL:       "postgres://db",
				InternalToken:     "secret",
				BillingOwner:      "go",
				UpstreamOwnership: OwnershipProvider,
				RecoveryDir:       "C:/secure/gateway-recovery",
			},
		},
		{
			name: "authoritative accepts non charging new api ownership",
			cfg: Config{
				BillingMode:       BillingAuthoritative,
				DatabaseURL:       "postgres://db",
				InternalToken:     "secret",
				BillingOwner:      "go",
				UpstreamOwnership: OwnershipNonChargingNewAPI,
				RecoveryDir:       "C:/secure/gateway-recovery",
			},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			require.NoError(t, testCase.cfg.Validate())
		})
	}
}

func TestValidateRejectsUnsafeAuthoritativeMode(t *testing.T) {
	cfg := Config{BillingMode: BillingAuthoritative, DatabaseURL: "postgres://db", InternalToken: "secret"}

	err := cfg.Validate()
	require.ErrorContains(t, err, "WINLUME_GATEWAY_BILLING_OWNER=go")
}

func TestValidateRejectsIncompleteBillingConfiguration(t *testing.T) {
	testCases := []struct {
		name string
		cfg  Config
		want string
	}{
		{
			name: "shadow without database",
			cfg:  Config{BillingMode: BillingShadow, InternalToken: "secret"},
			want: "DATABASE_URL",
		},
		{
			name: "shadow without internal token",
			cfg:  Config{BillingMode: BillingShadow, DatabaseURL: "postgres://db"},
			want: "WINLUME_GATEWAY_INTERNAL_TOKEN",
		},
		{
			name: "authoritative with unsafe ownership",
			cfg: Config{
				BillingMode:       BillingAuthoritative,
				DatabaseURL:       "postgres://db",
				InternalToken:     "secret",
				BillingOwner:      "go",
				UpstreamOwnership: "new_api",
				RecoveryDir:       "C:/secure/gateway-recovery",
			},
			want: "WINLUME_GATEWAY_UPSTREAM_OWNERSHIP",
		},
		{
			name: "authoritative without recovery directory",
			cfg: Config{
				BillingMode:       BillingAuthoritative,
				DatabaseURL:       "postgres://db",
				InternalToken:     "secret",
				BillingOwner:      "go",
				UpstreamOwnership: OwnershipProvider,
			},
			want: "WINLUME_GATEWAY_RECOVERY_DIR",
		},
		{
			name: "unknown billing mode",
			cfg:  Config{BillingMode: "handoff"},
			want: "WINLUME_GATEWAY_BILLING_MODE",
		},
		{
			name: "manual malformed upstream",
			cfg: Config{
				BillingMode: BillingOff,
				Upstreams: map[ProtocolFamily]UpstreamConfig{
					ProtocolOpenAI: {BaseURL: "ftp://provider.example/v1"},
				},
			},
			want: "must use http or https",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			require.ErrorContains(t, testCase.cfg.Validate(), testCase.want)
		})
	}
}
