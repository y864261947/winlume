package observability

import (
	"bytes"
	"context"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/prometheus/client_golang/prometheus/testutil"
	"github.com/stretchr/testify/require"
)

const (
	secretDSN          = "postgres://gateway:sup3rSecret@db.internal:5432/gateway?sslmode=require"
	secretHeaderValue  = "Bearer sk-live-abcdef0123456789"
	secretRequestBody  = `{"messages":[{"role":"user","content":"my ssn is 123-45-6789"}]}`
	secretUpstreamBody = `{"error":{"message":"upstream key sk-proj-verysecret rejected by provider.internal"}}`
	secretGenerated    = "The definitely-not-public answer is xk-generated-content-42"
)

func TestSanitizeLabelRejectsSecretBearingInput(t *testing.T) {
	inputs := []string{secretDSN, secretHeaderValue, secretRequestBody, secretUpstreamBody, secretGenerated}
	for _, input := range inputs {
		sanitized := SanitizeLabel(input)
		require.NotContains(t, sanitized, "secret")
		require.NotContains(t, sanitized, "sk-")
		require.NotContains(t, sanitized, "postgres://")
		require.LessOrEqual(t, len(sanitized), maxSanitizedLabelLength)
	}
}

func TestNormalizeModelFamilyNeverReturnsExactModel(t *testing.T) {
	require.Equal(t, "claude", NormalizeModelFamily("claude-3-5-sonnet-20241022"))
	require.Equal(t, "openai", NormalizeModelFamily("gpt-4o-mini-2024-07-18"))
	require.Equal(t, "gemini", NormalizeModelFamily("gemini-1.5-pro"))
	require.Equal(t, "other", NormalizeModelFamily("some-super-secret-fine-tuned-model-id-42"))
	require.Equal(t, unknownLabel, NormalizeModelFamily(""))
}

func TestMetricsRequestLabelsAreBoundedAndSecretFree(t *testing.T) {
	metrics := NewMetrics()
	metrics.RecordRequest("openai", "gpt-4o-secret-deployment-id-9f3c", "authoritative", secretHeaderValue)
	metrics.RecordRequest("does-not-exist-protocol", "claude-3-opus", "off", "success")

	exposed := gather(t, metrics)
	require.Contains(t, exposed, `protocol="unknown"`)
	require.Contains(t, exposed, `model_family="claude"`)
	for _, secret := range []string{secretDSN, secretHeaderValue, secretRequestBody, secretUpstreamBody, secretGenerated, "gpt-4o-secret-deployment-id-9f3c"} {
		require.NotContains(t, exposed, secret)
	}
}

func TestMetricsAttemptUsageProvenanceAndShadowMismatchAreBounded(t *testing.T) {
	metrics := NewMetrics()
	metrics.RecordAttempt("claude", "retried")
	metrics.RecordAttempt("claude", secretUpstreamBody)
	metrics.RecordUsageProvenance("openai", "upstream")
	metrics.RecordUsageProvenance("openai", "not-a-real-provenance-"+secretDSN)
	metrics.RecordShadowMismatch("cost_mismatch")
	metrics.RecordShadowMismatch(secretGenerated)

	exposed := gather(t, metrics)
	require.Contains(t, exposed, `gateway_relay_attempts_total{outcome="retried",protocol="claude"} 1`)
	require.Contains(t, exposed, `gateway_usage_provenance_total{protocol="openai",provenance="upstream"} 1`)
	require.Contains(t, exposed, `gateway_shadow_mismatch_total{mismatch_class="cost_mismatch"} 1`)
	for _, secret := range []string{secretDSN, secretUpstreamBody, secretGenerated} {
		require.NotContains(t, exposed, secret)
	}
}

func TestMetricsBillingOperationsRecoveryAndInsufficientFunds(t *testing.T) {
	metrics := NewMetrics()
	metrics.RecordBillingOperation("authoritative", "reserve", "success")
	metrics.RecordBillingOperation("authoritative", "settle", "success")
	metrics.RecordBillingOperation("authoritative", "refund", "success")
	metrics.RecordBillingOperation("authoritative", "pending", secretDSN)
	metrics.RecordRecovery("settled", 3)
	metrics.RecordRecovery("reversed", 1)
	metrics.RecordInsufficientFunds("openai")

	exposed := gather(t, metrics)
	require.Contains(t, exposed, `gateway_billing_operations_total{billing_mode="authoritative",event="reserve",outcome="success"} 1`)
	require.Contains(t, exposed, `gateway_billing_operations_total{billing_mode="authoritative",event="settle",outcome="success"} 1`)
	require.Contains(t, exposed, `gateway_billing_operations_total{billing_mode="authoritative",event="refund",outcome="success"} 1`)
	require.Contains(t, exposed, `gateway_recovery_events_total{event="settled"} 3`)
	require.Contains(t, exposed, `gateway_recovery_events_total{event="reversed"} 1`)
	require.Contains(t, exposed, `gateway_insufficient_funds_total{protocol="openai"} 1`)
	require.NotContains(t, exposed, secretDSN)
}

func TestMetricsChargeCostProfitAreCountersInMicrocredits(t *testing.T) {
	metrics := NewMetrics()
	metrics.RecordCharge("authoritative", "openai", 1200)
	metrics.RecordCost("authoritative", "openai", 800)
	metrics.RecordProfit("authoritative", "openai", 400)

	require.Equal(t, float64(1200), testutil.ToFloat64(metrics.chargeMicrocredits.WithLabelValues("authoritative", "openai")))
	require.Equal(t, float64(800), testutil.ToFloat64(metrics.costMicrocredits.WithLabelValues("authoritative", "openai")))
	require.Equal(t, float64(400), testutil.ToFloat64(metrics.profitMicrocredits.WithLabelValues("authoritative", "openai")))
}

func TestMetricsHandlerServesPrometheusTextFormat(t *testing.T) {
	metrics := NewMetrics()
	metrics.RecordRequest("openai", "gpt-4o", "off", "success")
	exposed := gather(t, metrics)
	require.Contains(t, exposed, "# HELP gateway_requests_total")
	require.Contains(t, exposed, "# TYPE gateway_requests_total counter")
}

func TestLoggerRedactsOversizedAndUnsanitizedFields(t *testing.T) {
	var buffer bytes.Buffer
	logger := NewLogger(&buffer)

	oversizedRequestID := strings.Repeat("a", 5000) + secretHeaderValue
	logger.Error(context.Background(), "upstream relay failed", Fields{
		RequestID:   oversizedRequestID,
		UserID:      "user-123",
		APIKeyID:    "key-456",
		Protocol:    "openai",
		BillingMode: "authoritative",
		ChannelID:   "channel-1",
		ErrorClass:  secretUpstreamBody,
		StatusCode:  502,
	})

	output := buffer.String()
	for _, secret := range []string{secretDSN, secretHeaderValue, secretRequestBody, secretUpstreamBody, secretGenerated} {
		require.NotContains(t, output, secret)
	}
	require.Contains(t, output, `"error_class":"other"`)
	require.Contains(t, output, `"request_id":"redacted_oversized_value"`)
	require.Contains(t, output, `"status_code":502`)
}

func TestLoggerNeverEmitsEmptyFieldsAsNoise(t *testing.T) {
	var buffer bytes.Buffer
	logger := NewLogger(&buffer)
	logger.Info(context.Background(), "request completed", Fields{Protocol: "claude", BillingMode: "shadow"})
	output := buffer.String()
	require.Contains(t, output, `"protocol":"claude"`)
	require.NotContains(t, output, `"user_id"`)
	require.NotContains(t, output, `"api_key_id"`)
}

func gather(t *testing.T, metrics *Metrics) string {
	t.Helper()
	families, err := metrics.registry.Gather()
	require.NoError(t, err)
	var builder strings.Builder
	for _, family := range families {
		for _, metric := range family.Metric {
			builder.WriteString(family.GetName())
			builder.WriteString("{")
			for index, label := range metric.Label {
				if index > 0 {
					builder.WriteString(",")
				}
				builder.WriteString(label.GetName())
				builder.WriteString(`="`)
				builder.WriteString(label.GetValue())
				builder.WriteString(`"`)
			}
			builder.WriteString("} ")
			if metric.Counter != nil {
				builder.WriteString(strconv.FormatFloat(metric.Counter.GetValue(), 'f', -1, 64))
			}
			builder.WriteString("\n")
		}
	}
	// Also include the real Prometheus text exposition so HELP/TYPE lines and
	// exact formatting are covered by the same assertions.
	handler := metrics.Handler()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest("GET", "/metrics", nil)
	handler.ServeHTTP(recorder, request)
	builder.WriteString(recorder.Body.String())
	return builder.String()
}
