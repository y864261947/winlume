// Package importer builds and imports a sanitized, immutable new-api pricing
// catalog. It intentionally has no access to channel credentials.
package importer

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"reizo/services/gateway/internal/pricing"
)

const (
	AlgorithmVersion        = "newapi-billing-v1"
	DefaultQuotaPerUnit     = 500_000
	DefaultPreConsumedQuota = 500
)

var (
	ErrInvalidSource  = errors.New("pricing importer: invalid source data")
	ErrInvalidOptions = errors.New("pricing importer: invalid options")
)

// Source supplies only the pricing options and sanitized ability metadata
// required to build a catalog. Implementations must never load channel keys,
// base URLs, custom headers, or arbitrary channel settings.
type Source interface {
	Load(context.Context) (SourceData, error)
}

// Target owns catalog persistence. InsertDraft is transactional: it writes
// the catalog and all children, and optionally promotes it in that transaction.
type Target interface {
	FindByHash(context.Context, string) (ExistingCatalog, bool, error)
	InsertDraft(context.Context, Catalog, bool) (uuid.UUID, string, error)
	Activate(context.Context, uuid.UUID) error
}

type SourceData struct {
	Options      map[string]string
	Availability []Availability
}

// Availability is intentionally limited to fields suitable for a future
// selector. It does not identify an upstream endpoint or credential.
type Availability struct {
	Model          string
	BillingGroup   string
	ProviderType   int64
	ProtocolFamily string
	Enabled        bool
	Priority       int64
	Weight         int64
}

// Catalog is the importer-owned representation of one immutable pricing
// version. Snapshot is canonical sanitized JSON used for source hashing and
// audit, not a raw database dump.
type Catalog struct {
	SourceLabel       string
	SourceHash        string
	AlgorithmVersion  string
	QuotaPerUnit      decimal.Decimal
	PreConsumedTokens int64
	Snapshot          json.RawMessage
	Rules             []pricing.Rule
	GroupRules        []pricing.GroupRule
	Availability      []Availability
}

type ExistingCatalog struct {
	ID    uuid.UUID
	State string
}

type Options struct {
	SourceLabel string
	Apply       bool
	Activate    bool
}

type Report struct {
	DryRun               bool
	Noop                 bool
	Activated            bool
	CatalogID            uuid.UUID
	CatalogState         string
	SourceHash           string
	AlgorithmVersion     string
	RuleCount            int
	GroupRuleCount       int
	AvailabilityCount    int
	DisabledAvailability int
}
