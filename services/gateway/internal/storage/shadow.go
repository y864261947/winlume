package storage

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// ShadowEvent has only normalized numbers and frozen, sanitized pricing data.
// Its JSON fields must never contain a request body, API key, channel URL, or
// upstream authorization value.
type ShadowEvent struct {
	RequestID                  string
	UserID                     uuid.UUID
	OrganizationID             *uuid.UUID
	APIKeyID                   *uuid.UUID
	UsageEventID               *uuid.UUID
	CatalogVersionID           uuid.UUID
	Model                      string
	CanonicalUsage             json.RawMessage
	UsageProvenance            json.RawMessage
	PricingQuote               json.RawMessage
	CalculatedReservationQuota int64
	CalculatedActualQuota      *int64
	ReferenceQuota             *int64
	QuotaDelta                 *int64
	Outcome                    string
	MismatchClass              string
	CompletionState            string
	SanitizedErrorClass        string
	CompletedAt                *time.Time
}

type ShadowFilter struct {
	Cursor        string
	Limit         int
	From          *time.Time
	To            *time.Time
	Model         string
	RequestID     string
	Outcome       string
	MismatchClass string
}

type ShadowRecord struct {
	ID                         uuid.UUID       `json:"id"`
	RequestID                  string          `json:"request_id"`
	UserID                     uuid.UUID       `json:"user_id"`
	OrganizationID             *uuid.UUID      `json:"organization_id,omitempty"`
	APIKeyID                   *uuid.UUID      `json:"api_key_id,omitempty"`
	CatalogVersionID           uuid.UUID       `json:"catalog_version_id"`
	Model                      string          `json:"model"`
	CanonicalUsage             json.RawMessage `json:"canonical_usage"`
	UsageProvenance            json.RawMessage `json:"usage_provenance"`
	PricingQuote               json.RawMessage `json:"pricing_quote"`
	CalculatedReservationQuota int64           `json:"calculated_reservation_quota"`
	CalculatedActualQuota      *int64          `json:"calculated_actual_quota,omitempty"`
	ReferenceQuota             *int64          `json:"reference_quota,omitempty"`
	QuotaDelta                 *int64          `json:"quota_delta,omitempty"`
	Outcome                    string          `json:"outcome"`
	MismatchClass              string          `json:"mismatch_class,omitempty"`
	CompletionState            string          `json:"completion_state,omitempty"`
	SanitizedErrorClass        string          `json:"sanitized_error_class,omitempty"`
	CompletedAt                *time.Time      `json:"completed_at,omitempty"`
	CreatedAt                  time.Time       `json:"created_at"`
}

type ShadowPage struct {
	Events     []ShadowRecord `json:"events"`
	NextCursor string         `json:"next_cursor,omitempty"`
}

type shadowCursor struct {
	CreatedAt time.Time `json:"created_at"`
	ID        uuid.UUID `json:"id"`
}

func (store *Store) InsertShadow(ctx context.Context, event ShadowEvent) (uuid.UUID, error) {
	if store == nil || store.pool == nil || event.UserID == uuid.Nil || event.CatalogVersionID == uuid.Nil || event.RequestID == "" || event.Model == "" || event.Outcome == "" || event.CalculatedReservationQuota < 0 {
		return uuid.Nil, ErrUnavailable
	}
	if len(event.CanonicalUsage) == 0 || len(event.UsageProvenance) == 0 || len(event.PricingQuote) == 0 {
		return uuid.Nil, ErrUnavailable
	}
	var id uuid.UUID
	err := store.pool.QueryRow(ctx, `
		INSERT INTO billing_shadow_events (
			request_id, user_id, organization_id, api_key_id, usage_event_id, catalog_version_id, model,
			canonical_usage, usage_provenance, pricing_quote, calculated_reservation_quota,
			calculated_actual_quota, reference_quota, quota_delta, outcome, mismatch_class,
			completion_state, sanitized_error_class, completed_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NULLIF($16, ''), NULLIF($17, ''), NULLIF($18, ''), $19)
		RETURNING id`,
		event.RequestID, event.UserID, event.OrganizationID, event.APIKeyID, event.UsageEventID, event.CatalogVersionID, event.Model,
		event.CanonicalUsage, event.UsageProvenance, event.PricingQuote, event.CalculatedReservationQuota,
		event.CalculatedActualQuota, event.ReferenceQuota, event.QuotaDelta, event.Outcome, event.MismatchClass,
		event.CompletionState, event.SanitizedErrorClass, event.CompletedAt,
	).Scan(&id)
	if err != nil {
		return uuid.Nil, errors.New("shadow event could not be persisted")
	}
	return id, nil
}

// ListShadows uses a fixed descending (created_at, id) order and parameterized
// filter values. Callers cannot select a SQL column, sort direction, or join.
func (store *Store) ListShadows(ctx context.Context, filter ShadowFilter) (ShadowPage, error) {
	if store == nil || store.pool == nil {
		return ShadowPage{}, ErrUnavailable
	}
	if filter.Limit <= 0 {
		filter.Limit = 50
	}
	if filter.Limit > 200 {
		return ShadowPage{}, fmt.Errorf("shadow event limit exceeds 200")
	}
	var cursor *shadowCursor
	if filter.Cursor != "" {
		decoded, err := base64.RawURLEncoding.DecodeString(filter.Cursor)
		if err != nil || json.Unmarshal(decoded, &cursor) != nil || cursor == nil || cursor.ID == uuid.Nil || cursor.CreatedAt.IsZero() {
			return ShadowPage{}, fmt.Errorf("invalid shadow event cursor")
		}
	}

	conditions := []string{"TRUE"}
	arguments := make([]any, 0, 8)
	appendCondition := func(condition string, value any) {
		arguments = append(arguments, value)
		conditions = append(conditions, fmt.Sprintf(condition, len(arguments)))
	}
	if filter.From != nil {
		appendCondition("created_at >= $%d", *filter.From)
	}
	if filter.To != nil {
		appendCondition("created_at <= $%d", *filter.To)
	}
	if value := strings.TrimSpace(filter.Model); value != "" {
		appendCondition("model = $%d", value)
	}
	if value := strings.TrimSpace(filter.RequestID); value != "" {
		appendCondition("request_id = $%d", value)
	}
	if value := strings.TrimSpace(filter.Outcome); value != "" {
		appendCondition("outcome = $%d", value)
	}
	if value := strings.TrimSpace(filter.MismatchClass); value != "" {
		appendCondition("mismatch_class = $%d", value)
	}
	if cursor != nil {
		arguments = append(arguments, cursor.CreatedAt, cursor.ID)
		conditions = append(conditions, fmt.Sprintf("(created_at, id) < ($%d, $%d)", len(arguments)-1, len(arguments)))
	}
	arguments = append(arguments, filter.Limit)
	query := `
		SELECT id, request_id, user_id, organization_id, api_key_id, catalog_version_id, model,
		       canonical_usage, usage_provenance, pricing_quote, calculated_reservation_quota,
		       calculated_actual_quota, reference_quota, quota_delta, outcome, mismatch_class,
		       completion_state, sanitized_error_class, completed_at, created_at
		FROM billing_shadow_events WHERE ` + strings.Join(conditions, " AND ") +
		` ORDER BY created_at DESC, id DESC LIMIT $` + fmt.Sprint(len(arguments))
	rows, err := store.pool.Query(ctx, query, arguments...)
	if err != nil {
		return ShadowPage{}, ErrUnavailable
	}
	defer rows.Close()
	page := ShadowPage{Events: make([]ShadowRecord, 0, filter.Limit)}
	for rows.Next() {
		var record ShadowRecord
		if err := rows.Scan(&record.ID, &record.RequestID, &record.UserID, &record.OrganizationID, &record.APIKeyID, &record.CatalogVersionID, &record.Model, &record.CanonicalUsage, &record.UsageProvenance, &record.PricingQuote, &record.CalculatedReservationQuota, &record.CalculatedActualQuota, &record.ReferenceQuota, &record.QuotaDelta, &record.Outcome, &record.MismatchClass, &record.CompletionState, &record.SanitizedErrorClass, &record.CompletedAt, &record.CreatedAt); err != nil {
			return ShadowPage{}, ErrUnavailable
		}
		page.Events = append(page.Events, record)
	}
	if err := rows.Err(); err != nil {
		return ShadowPage{}, ErrUnavailable
	}
	if len(page.Events) == filter.Limit {
		last := page.Events[len(page.Events)-1]
		encoded, _ := json.Marshal(shadowCursor{CreatedAt: last.CreatedAt, ID: last.ID})
		page.NextCursor = base64.RawURLEncoding.EncodeToString(encoded)
	}
	return page, nil
}
