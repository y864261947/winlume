package storage

// channels.go owns CRUD for the channels table: connection-level relay
// configuration (name, protocol family, base URL, api key, and selection
// weighting) managed through the gateway admin API. Enabled rows here are
// read by relay.DBSelector (services/gateway/internal/relay/db_selector.go)
// for live-request routing, with relay.StaticSelector
// (services/gateway/internal/relay/static_selector.go, the env-var-driven
// path) as its fallback for any protocol family with no enabled channels.
//
// api_key is encrypted at rest (AES-256-GCM, see channel_crypto.go) and
// decrypted transparently by this package on read, so every other layer -
// adminapi, and relay.DBSelector - continues to see plaintext in memory
// exactly as before this column was encrypted. adminapi is responsible for
// redacting the (already plaintext-in-memory) value before it reaches an
// HTTP response.

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"reizo/services/gateway/internal/config"
)

// ErrChannelNotFound is returned when a mutation or lookup targets a
// channels row that does not exist.
var ErrChannelNotFound = errors.New("channel not found")

// ErrInvalidChannelInput is wrapped by validation failures on caller-supplied
// channel fields. It is returned before any database statement runs.
var ErrInvalidChannelInput = errors.New("invalid channel input")

// ChannelRecord mirrors one channels row.
type ChannelRecord struct {
	ID             uuid.UUID      `json:"id"`
	Name           string         `json:"name"`
	ProtocolFamily string         `json:"protocol_family"`
	BaseURL        string         `json:"base_url"`
	APIKey         string         `json:"api_key,omitempty"`
	Enabled        bool           `json:"enabled"`
	Priority       int            `json:"priority"`
	Weight         int            `json:"weight"`
	Metadata       map[string]any `json:"metadata"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
}

// ChannelInput is a caller-supplied channel definition used for both create
// and update. For update, only non-nil pointer fields are applied
// (UpdateChannel treats it as a partial patch); Create requires all required
// fields to be set by the caller before calling ChannelInput.Validate via
// validateChannelInputForCreate.
type ChannelInput struct {
	Name           *string        `json:"name,omitempty"`
	ProtocolFamily *string        `json:"protocol_family,omitempty"`
	BaseURL        *string        `json:"base_url,omitempty"`
	APIKey         *string        `json:"api_key,omitempty"`
	Enabled        *bool          `json:"enabled,omitempty"`
	Priority       *int           `json:"priority,omitempty"`
	Weight         *int           `json:"weight,omitempty"`
	Metadata       map[string]any `json:"metadata,omitempty"`
}

func validateChannelInputForCreate(input ChannelInput) error {
	if input.Name == nil || strings.TrimSpace(*input.Name) == "" {
		return fmt.Errorf("%w: name is required", ErrInvalidChannelInput)
	}
	if input.ProtocolFamily == nil || strings.TrimSpace(*input.ProtocolFamily) == "" {
		return fmt.Errorf("%w: protocol_family is required", ErrInvalidChannelInput)
	}
	if input.BaseURL == nil || strings.TrimSpace(*input.BaseURL) == "" {
		return fmt.Errorf("%w: base_url is required", ErrInvalidChannelInput)
	}
	if input.APIKey == nil || strings.TrimSpace(*input.APIKey) == "" {
		return fmt.Errorf("%w: api_key is required", ErrInvalidChannelInput)
	}
	return validateChannelInputCommon(input)
}

func validateChannelInputCommon(input ChannelInput) error {
	if input.ProtocolFamily != nil && !config.IsKnownProtocolFamily(*input.ProtocolFamily) {
		return fmt.Errorf("%w: protocol_family %q is not a known protocol family", ErrInvalidChannelInput, *input.ProtocolFamily)
	}
	if input.Name != nil && strings.TrimSpace(*input.Name) == "" {
		return fmt.Errorf("%w: name must not be empty", ErrInvalidChannelInput)
	}
	if input.BaseURL != nil && strings.TrimSpace(*input.BaseURL) == "" {
		return fmt.Errorf("%w: base_url must not be empty", ErrInvalidChannelInput)
	}
	if input.APIKey != nil && strings.TrimSpace(*input.APIKey) == "" {
		return fmt.Errorf("%w: api_key must not be empty", ErrInvalidChannelInput)
	}
	if input.Priority != nil && *input.Priority < 0 {
		return fmt.Errorf("%w: priority must be >= 0", ErrInvalidChannelInput)
	}
	if input.Weight != nil && *input.Weight < 0 {
		return fmt.Errorf("%w: weight must be >= 0", ErrInvalidChannelInput)
	}
	return nil
}

const channelSelectColumns = `
	id, name, protocol_family, base_url, api_key, enabled, priority, weight, metadata, created_at, updated_at`

// scanChannel reads one channels row and decrypts its api_key column back to
// plaintext (channelCipher.Decrypt is a no-op passthrough for pre-existing
// unencrypted rows - see channel_crypto.go), so every caller of scanChannel
// sees plaintext exactly as it did before this column was encrypted.
func (store *Store) scanChannel(row pgx.Row) (ChannelRecord, error) {
	var record ChannelRecord
	if err := row.Scan(
		&record.ID, &record.Name, &record.ProtocolFamily, &record.BaseURL, &record.APIKey,
		&record.Enabled, &record.Priority, &record.Weight, &record.Metadata,
		&record.CreatedAt, &record.UpdatedAt,
	); err != nil {
		return ChannelRecord{}, err
	}
	plaintext, err := store.channelCipher.Decrypt(record.APIKey)
	if err != nil {
		return ChannelRecord{}, fmt.Errorf("decrypt channel api_key: %w", err)
	}
	record.APIKey = plaintext
	return record, nil
}

// ListChannels returns every channel, newest first.
func (store *Store) ListChannels(ctx context.Context) ([]ChannelRecord, error) {
	if store == nil || store.pool == nil {
		return nil, ErrUnavailable
	}
	rows, err := store.pool.Query(ctx, `SELECT `+channelSelectColumns+` FROM channels ORDER BY created_at DESC`)
	if err != nil {
		return nil, ErrUnavailable
	}
	defer rows.Close()

	records := make([]ChannelRecord, 0)
	for rows.Next() {
		record, scanErr := store.scanChannel(rows)
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

// CreateChannel inserts a new channel row after validating the input.
func (store *Store) CreateChannel(ctx context.Context, input ChannelInput) (ChannelRecord, error) {
	if store == nil || store.pool == nil {
		return ChannelRecord{}, ErrUnavailable
	}
	if err := validateChannelInputForCreate(input); err != nil {
		return ChannelRecord{}, err
	}
	metadata := input.Metadata
	if metadata == nil {
		metadata = map[string]any{}
	}
	enabled := true
	if input.Enabled != nil {
		enabled = *input.Enabled
	}
	priority := 0
	if input.Priority != nil {
		priority = *input.Priority
	}
	weight := 0
	if input.Weight != nil {
		weight = *input.Weight
	}
	encryptedAPIKey, err := store.channelCipher.Encrypt(*input.APIKey)
	if err != nil {
		return ChannelRecord{}, fmt.Errorf("encrypt channel api_key: %w", err)
	}

	row := store.pool.QueryRow(ctx, `
		INSERT INTO channels (name, protocol_family, base_url, api_key, enabled, priority, weight, metadata)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING `+channelSelectColumns,
		*input.Name, *input.ProtocolFamily, *input.BaseURL, encryptedAPIKey, enabled, priority, weight, metadata)
	record, err := store.scanChannel(row)
	if err != nil {
		if isUniqueViolation(err) {
			return ChannelRecord{}, fmt.Errorf("%w: a channel named %q already exists", ErrInvalidChannelInput, *input.Name)
		}
		return ChannelRecord{}, ErrUnavailable
	}
	return record, nil
}

// UpdateChannel applies a partial patch to an existing channel: only fields
// set (non-nil) on input are changed. It fails with ErrChannelNotFound if no
// channel matches id.
func (store *Store) UpdateChannel(ctx context.Context, id uuid.UUID, input ChannelInput) (ChannelRecord, error) {
	if store == nil || store.pool == nil {
		return ChannelRecord{}, ErrUnavailable
	}
	if err := validateChannelInputCommon(input); err != nil {
		return ChannelRecord{}, err
	}
	// encryptedAPIKey stays nil (so COALESCE keeps the existing, already
	// encrypted column value) unless the caller actually included a new
	// api_key in this patch.
	var encryptedAPIKey *string
	if input.APIKey != nil {
		encrypted, err := store.channelCipher.Encrypt(*input.APIKey)
		if err != nil {
			return ChannelRecord{}, fmt.Errorf("encrypt channel api_key: %w", err)
		}
		encryptedAPIKey = &encrypted
	}

	row := store.pool.QueryRow(ctx, `
		UPDATE channels SET
			name = COALESCE($2, name),
			protocol_family = COALESCE($3, protocol_family),
			base_url = COALESCE($4, base_url),
			api_key = COALESCE($5, api_key),
			enabled = COALESCE($6, enabled),
			priority = COALESCE($7, priority),
			weight = COALESCE($8, weight),
			metadata = COALESCE($9, metadata),
			updated_at = now()
		WHERE id = $1
		RETURNING `+channelSelectColumns,
		id, input.Name, input.ProtocolFamily, input.BaseURL, encryptedAPIKey,
		input.Enabled, input.Priority, input.Weight, channelMetadataParam(input.Metadata))
	record, err := store.scanChannel(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return ChannelRecord{}, ErrChannelNotFound
	}
	if err != nil {
		if isUniqueViolation(err) {
			return ChannelRecord{}, fmt.Errorf("%w: a channel with that name already exists", ErrInvalidChannelInput)
		}
		return ChannelRecord{}, ErrUnavailable
	}
	return record, nil
}

// channelMetadataParam returns nil (so COALESCE keeps the existing column
// value) when the caller did not supply metadata, distinguishing "not
// provided" from an explicit empty object.
func channelMetadataParam(metadata map[string]any) any {
	if metadata == nil {
		return nil
	}
	return metadata
}

// DeleteChannel removes a channel row. It fails with ErrChannelNotFound if no
// channel matches id.
func (store *Store) DeleteChannel(ctx context.Context, id uuid.UUID) error {
	if store == nil || store.pool == nil {
		return ErrUnavailable
	}
	tag, err := store.pool.Exec(ctx, `DELETE FROM channels WHERE id = $1`, id)
	if err != nil {
		return ErrUnavailable
	}
	if tag.RowsAffected() == 0 {
		return ErrChannelNotFound
	}
	return nil
}

func isUniqueViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "duplicate key value violates unique constraint")
}
