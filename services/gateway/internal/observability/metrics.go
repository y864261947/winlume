package observability

import (
	"net/http"
	"strings"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// unknownLabel is the value used whenever an input does not match one of a
// metric's known, bounded label values. It guarantees every label stays
// within a small, fixed vocabulary regardless of what a caller passes in.
const unknownLabel = "unknown"

// maxSanitizedLabelLength bounds every free-form (but caller-controlled, not
// user-controlled) label this package accepts, so a programming mistake
// elsewhere can never turn a label into an unbounded-cardinality field.
const maxSanitizedLabelLength = 64

var knownProtocols = map[string]struct{}{
	"openai": {}, "claude": {}, "gemini": {}, "images": {}, "audio": {},
	"embeddings": {}, "realtime": {}, "task": {}, "midjourney": {}, "suno": {}, "video": {},
}

var knownBillingModes = map[string]struct{}{
	"off": {}, "shadow": {}, "authoritative": {},
}

var knownProvenance = map[string]struct{}{
	"upstream": {}, "locally_counted": {}, "request_estimate": {}, "provider_cost": {}, "derived": {},
}

func normalizeEnum(value string, allowed map[string]struct{}) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if _, ok := allowed[value]; ok {
		return value
	}
	return unknownLabel
}

// NormalizeModelFamily buckets an arbitrary upstream model identifier into a
// small, fixed vocabulary so the exact requested model is never used as a
// metric or log label.
func NormalizeModelFamily(model string) string {
	model = strings.ToLower(strings.TrimSpace(model))
	switch {
	case model == "":
		return unknownLabel
	case strings.Contains(model, "claude"):
		return "claude"
	case strings.Contains(model, "gemini"):
		return "gemini"
	case strings.Contains(model, "grok"):
		return "grok"
	case strings.Contains(model, "dall-e"), strings.Contains(model, "dalle"), strings.Contains(model, "image"):
		return "images"
	case strings.Contains(model, "whisper"), strings.Contains(model, "tts"), strings.Contains(model, "audio"):
		return "audio"
	case strings.Contains(model, "gpt"), strings.Contains(model, "o1"), strings.Contains(model, "o3"), strings.Contains(model, "o4"), strings.Contains(model, "davinci"):
		return "openai"
	default:
		return "other"
	}
}

// SanitizeLabel reduces an arbitrary, caller-supplied classification string
// (never raw user input, never a header/body/DSN/error message) to a bounded
// vocabulary safe to use as a metric label or log field value: lowercase
// ASCII letters, digits, underscore, and hyphen only, capped in length.
// Anything else collapses to a single fixed fallback value so it can never
// grow metric or log cardinality without bound.
func SanitizeLabel(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" {
		return ""
	}
	if len(value) > maxSanitizedLabelLength {
		return "other"
	}
	for _, character := range value {
		if !(character >= 'a' && character <= 'z' || character >= '0' && character <= '9' || character == '_' || character == '-') {
			return "other"
		}
	}
	return value
}

// Metrics exposes bounded-cardinality Prometheus counters for the gateway's
// billing-relevant lifecycle. Every label passed through a Record* method is
// normalized first, so no counter can ever be labeled by a user ID, API key
// ID, request ID, exact arbitrary model, channel URL, or raw error message.
type Metrics struct {
	registry *prometheus.Registry

	requestsTotal          *prometheus.CounterVec
	attemptsTotal          *prometheus.CounterVec
	usageProvenanceTotal   *prometheus.CounterVec
	shadowMismatchTotal    *prometheus.CounterVec
	billingOperationsTotal *prometheus.CounterVec
	recoveryEventsTotal    *prometheus.CounterVec
	insufficientFundsTotal *prometheus.CounterVec
	chargeMicrocredits     *prometheus.CounterVec
	costMicrocredits       *prometheus.CounterVec
	profitMicrocredits     *prometheus.CounterVec
}

// NewMetrics builds a fresh, isolated registry (never the global default
// registry) so tests and multiple gateway instances in one process never
// collide on registration.
func NewMetrics() *Metrics {
	registry := prometheus.NewRegistry()
	metrics := &Metrics{
		registry: registry,
		requestsTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "gateway_requests_total",
			Help: "Total public gateway requests by protocol, model family, billing mode, and outcome.",
		}, []string{"protocol", "model_family", "billing_mode", "outcome"}),
		attemptsTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "gateway_relay_attempts_total",
			Help: "Total relay attempts by protocol and outcome.",
		}, []string{"protocol", "outcome"}),
		usageProvenanceTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "gateway_usage_provenance_total",
			Help: "Total canonical usage fields observed by protocol and provenance.",
		}, []string{"protocol", "provenance"}),
		shadowMismatchTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "gateway_shadow_mismatch_total",
			Help: "Total shadow billing reconciliation mismatches by sanitized mismatch class.",
		}, []string{"mismatch_class"}),
		billingOperationsTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "gateway_billing_operations_total",
			Help: "Total billing lifecycle operations (reserve, settle, refund, pending) by billing mode, event, and outcome.",
		}, []string{"billing_mode", "event", "outcome"}),
		recoveryEventsTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "gateway_recovery_events_total",
			Help: "Total recovery worker pass outcomes by event.",
		}, []string{"event"}),
		insufficientFundsTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "gateway_insufficient_funds_total",
			Help: "Total requests rejected for insufficient billing quota by protocol.",
		}, []string{"protocol"}),
		chargeMicrocredits: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "gateway_charge_microcredits_total",
			Help: "Total charged microcredits by billing mode and protocol.",
		}, []string{"billing_mode", "protocol"}),
		costMicrocredits: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "gateway_cost_microcredits_total",
			Help: "Total upstream cost microcredits by billing mode and protocol.",
		}, []string{"billing_mode", "protocol"}),
		profitMicrocredits: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "gateway_profit_microcredits_total",
			Help: "Total profit microcredits (charge minus cost) by billing mode and protocol.",
		}, []string{"billing_mode", "protocol"}),
	}
	registry.MustRegister(
		metrics.requestsTotal, metrics.attemptsTotal, metrics.usageProvenanceTotal, metrics.shadowMismatchTotal,
		metrics.billingOperationsTotal, metrics.recoveryEventsTotal, metrics.insufficientFundsTotal,
		metrics.chargeMicrocredits, metrics.costMicrocredits, metrics.profitMicrocredits,
	)
	return metrics
}

// Handler returns the Prometheus scrape endpoint. Callers must mount it only
// behind the gateway's private/internal-token-gated surface, never on the
// public listener.
func (metrics *Metrics) Handler() http.Handler {
	if metrics == nil {
		return http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
			response.WriteHeader(http.StatusServiceUnavailable)
		})
	}
	return promhttp.HandlerFor(metrics.registry, promhttp.HandlerOpts{})
}

// RecordRequest counts one completed public request.
func (metrics *Metrics) RecordRequest(protocol, modelFamily, billingMode, outcome string) {
	if metrics == nil {
		return
	}
	metrics.requestsTotal.WithLabelValues(
		normalizeEnum(protocol, knownProtocols),
		orUnknown(NormalizeModelFamily(modelFamily)),
		normalizeEnum(billingMode, knownBillingModes),
		orUnknown(SanitizeLabel(outcome)),
	).Inc()
}

// RecordAttempt counts one relay attempt outcome.
func (metrics *Metrics) RecordAttempt(protocol string, outcome string) {
	if metrics == nil {
		return
	}
	metrics.attemptsTotal.WithLabelValues(
		normalizeEnum(protocol, knownProtocols),
		orUnknown(SanitizeLabel(outcome)),
	).Inc()
}

// RecordUsageProvenance counts one canonical usage field's provenance.
func (metrics *Metrics) RecordUsageProvenance(protocol, provenance string) {
	if metrics == nil {
		return
	}
	metrics.usageProvenanceTotal.WithLabelValues(
		normalizeEnum(protocol, knownProtocols),
		normalizeEnum(provenance, knownProvenance),
	).Inc()
}

// RecordShadowMismatch counts one shadow reconciliation mismatch by its
// already-sanitized mismatch class.
func (metrics *Metrics) RecordShadowMismatch(mismatchClass string) {
	if metrics == nil {
		return
	}
	metrics.shadowMismatchTotal.WithLabelValues(orUnknown(SanitizeLabel(mismatchClass))).Inc()
}

// RecordBillingOperation counts one billing lifecycle event: event is one of
// "reserve", "settle", "refund", or "pending"; outcome is a small, fixed,
// sanitized classification such as "success" or "insufficient_funds".
func (metrics *Metrics) RecordBillingOperation(billingMode, event, outcome string) {
	if metrics == nil {
		return
	}
	metrics.billingOperationsTotal.WithLabelValues(
		normalizeEnum(billingMode, knownBillingModes),
		orUnknown(SanitizeLabel(event)),
		orUnknown(SanitizeLabel(outcome)),
	).Inc()
}

// RecordRecovery adds delta occurrences of one recovery pass event ("settled",
// "replayed", "reversed", "skipped", "deferred", "error").
func (metrics *Metrics) RecordRecovery(event string, delta float64) {
	if metrics == nil || delta <= 0 {
		return
	}
	metrics.recoveryEventsTotal.WithLabelValues(orUnknown(SanitizeLabel(event))).Add(delta)
}

// RecordInsufficientFunds counts one request rejected for insufficient quota.
func (metrics *Metrics) RecordInsufficientFunds(protocol string) {
	if metrics == nil {
		return
	}
	metrics.insufficientFundsTotal.WithLabelValues(normalizeEnum(protocol, knownProtocols)).Inc()
}

// RecordCharge adds microcredits charged to the customer for one operation.
func (metrics *Metrics) RecordCharge(billingMode, protocol string, microcredits int64) {
	if metrics == nil || microcredits <= 0 {
		return
	}
	metrics.chargeMicrocredits.WithLabelValues(normalizeEnum(billingMode, knownBillingModes), normalizeEnum(protocol, knownProtocols)).Add(float64(microcredits))
}

// RecordCost adds microcredits of upstream provider cost for one operation.
func (metrics *Metrics) RecordCost(billingMode, protocol string, microcredits int64) {
	if metrics == nil || microcredits <= 0 {
		return
	}
	metrics.costMicrocredits.WithLabelValues(normalizeEnum(billingMode, knownBillingModes), normalizeEnum(protocol, knownProtocols)).Add(float64(microcredits))
}

// RecordProfit adds microcredits of profit (charge minus cost) for one
// operation. Profit may be negative in principle, but a counter cannot move
// backward, so callers should only report the positive margin; a negative or
// zero value is dropped rather than silently corrupting the counter.
func (metrics *Metrics) RecordProfit(billingMode, protocol string, microcredits int64) {
	if metrics == nil || microcredits <= 0 {
		return
	}
	metrics.profitMicrocredits.WithLabelValues(normalizeEnum(billingMode, knownBillingModes), normalizeEnum(protocol, knownProtocols)).Add(float64(microcredits))
}

func orUnknown(value string) string {
	if value == "" {
		return unknownLabel
	}
	return value
}
