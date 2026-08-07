package storage

// model_availability_admin.go owns read/update access to the
// model_availability table for the gateway admin API. Unlike pricing's
// group/model rules (pricing_admin.go), this table is intentionally NOT
// cloned forward by the pricing quick-edit flow (see the comment atop
// pricing_admin.go) - rows stay attached to whichever catalog version they
// were inserted against by the importer. Because of that, this file does a
// simple direct read/update against the active catalog's rows rather than
// the clone-draft/activate/retire dance pricing_admin.go performs: there is
// no versioned "replace the whole set" concept here, just toggling
// enabled/priority/weight on existing rows.

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ErrModelAvailabilityNotFound is returned when a mutation targets a
// model_availability row that does not exist.
var ErrModelAvailabilityNotFound = errors.New("model availability row not found")

// ErrInvalidModelAvailabilityInput is wrapped by validation failures on
// caller-supplied model availability fields. It is returned before any
// database statement runs.
var ErrInvalidModelAvailabilityInput = errors.New("invalid model availability input")

// ModelAvailabilityRecord mirrors one model_availability row.
type ModelAvailabilityRecord struct {
	ID               uuid.UUID      `json:"id"`
	CatalogVersionID uuid.UUID      `json:"catalog_version_id"`
	Model            string         `json:"model"`
	BillingGroup     string         `json:"billing_group"`
	ProviderType     int            `json:"provider_type"`
	ProtocolFamily   string         `json:"protocol_family"`
	Enabled          bool           `json:"enabled"`
	Priority         int            `json:"priority"`
	Weight           int            `json:"weight"`
	PriorityMetadata map[string]any `json:"priority_metadata"`
	CreatedAt        time.Time      `json:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at"`
}

// ModelAvailabilityUpdateInput is a partial patch applied to one
// model_availability row: only non-nil fields are changed, matching
// UpdateChannel's pattern in channels.go.
type ModelAvailabilityUpdateInput struct {
	Enabled  *bool `json:"enabled,omitempty"`
	Priority *int  `json:"priority,omitempty"`
	Weight   *int  `json:"weight,omitempty"`
}

func validateModelAvailabilityUpdateInput(input ModelAvailabilityUpdateInput) error {
	if input.Priority != nil && *input.Priority < 0 {
		return fmt.Errorf("%w: priority must be >= 0", ErrInvalidModelAvailabilityInput)
	}
	if input.Weight != nil && *input.Weight < 0 {
		return fmt.Errorf("%w: weight must be >= 0", ErrInvalidModelAvailabilityInput)
	}
	return nil
}

const modelAvailabilitySelectColumns = `
	id, catalog_version_id, model, billing_group, provider_type, protocol_family,
	enabled, priority, weight, priority_metadata, created_at, updated_at`

func scanModelAvailability(row pgx.Row) (ModelAvailabilityRecord, error) {
	var record ModelAvailabilityRecord
	if err := row.Scan(
		&record.ID, &record.CatalogVersionID, &record.Model, &record.BillingGroup,
		&record.ProviderType, &record.ProtocolFamily, &record.Enabled, &record.Priority,
		&record.Weight, &record.PriorityMetadata, &record.CreatedAt, &record.UpdatedAt,
	); err != nil {
		return ModelAvailabilityRecord{}, err
	}
	return record, nil
}

// ListModelAvailability returns every model_availability row attached to the
// currently active pricing catalog, ordered by model / billing group /
// provider type. It fails with ErrNoActiveCatalog if there is no active
// catalog.
func (store *Store) ListModelAvailability(ctx context.Context) ([]ModelAvailabilityRecord, error) {
	if store == nil || store.pool == nil {
		return nil, ErrUnavailable
	}
	var activeID uuid.UUID
	err := store.pool.QueryRow(ctx, `SELECT id FROM pricing_catalog_versions WHERE state = 'active'`).Scan(&activeID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNoActiveCatalog
	}
	if err != nil {
		return nil, ErrUnavailable
	}

	rows, err := store.pool.Query(ctx, `
		SELECT `+modelAvailabilitySelectColumns+`
		FROM model_availability
		WHERE catalog_version_id = $1
		ORDER BY model, billing_group, provider_type`, activeID)
	if err != nil {
		return nil, ErrUnavailable
	}
	defer rows.Close()

	records := make([]ModelAvailabilityRecord, 0)
	for rows.Next() {
		record, scanErr := scanModelAvailability(rows)
		if scanErr != nil {
			return nil, ErrUnavailable
		}
		records = append(records, record)
	}
	if rows.Err() != nil {
		return nil, ErrUnavailable
	}
	return records, nil
}

// UpdateModelAvailability applies a partial patch (enabled/priority/weight)
// to an existing model_availability row. It fails with
// ErrModelAvailabilityNotFound if no row matches id.
func (store *Store) UpdateModelAvailability(ctx context.Context, id uuid.UUID, input ModelAvailabilityUpdateInput) (ModelAvailabilityRecord, error) {
	if store == nil || store.pool == nil {
		return ModelAvailabilityRecord{}, ErrUnavailable
	}
	if err := validateModelAvailabilityUpdateInput(input); err != nil {
		return ModelAvailabilityRecord{}, err
	}

	row := store.pool.QueryRow(ctx, `
		UPDATE model_availability SET
			enabled = COALESCE($2, enabled),
			priority = COALESCE($3, priority),
			weight = COALESCE($4, weight),
			updated_at = now()
		WHERE id = $1
		RETURNING `+modelAvailabilitySelectColumns,
		id, input.Enabled, input.Priority, input.Weight)
	record, err := scanModelAvailability(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return ModelAvailabilityRecord{}, ErrModelAvailabilityNotFound
	}
	if err != nil {
		return ModelAvailabilityRecord{}, ErrUnavailable
	}
	return record, nil
}
