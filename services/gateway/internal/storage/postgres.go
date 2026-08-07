// Package storage owns Gateway runtime SQL. It never accepts raw API keys or
// source-new-api credentials.
package storage

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrUnavailable = errors.New("gateway storage unavailable")

// ErrChannelEncryptionKeyRequired is returned by Open when channelEncryptionKey
// is not a valid 32-byte AES-256 key. Open refuses to start a database-backed
// store without it, because that store owns the channels table and its
// api_key column must never be persisted in plaintext (see channel_crypto.go
// and config.Config.ChannelEncryptionKey). Set WINLUME_CHANNEL_ENCRYPTION_KEY
// before starting the gateway in shadow or authoritative billing mode.
var ErrChannelEncryptionKeyRequired = errors.New("WINLUME_CHANNEL_ENCRYPTION_KEY is required: it must decode to a 32-byte AES-256 key")

type Store struct {
	pool          *pgxpool.Pool
	channelCipher *channelCipher
}

func Open(ctx context.Context, databaseURL string, channelEncryptionKey []byte) (*Store, error) {
	if strings.TrimSpace(databaseURL) == "" {
		return nil, ErrUnavailable
	}
	cipher, err := newChannelCipher(channelEncryptionKey)
	if err != nil {
		return nil, ErrChannelEncryptionKeyRequired
	}
	configuration, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, ErrUnavailable
	}
	configuration.MaxConns = 8
	configuration.MinConns = 0
	configuration.MaxConnLifetime = 10 * time.Minute
	configuration.MaxConnIdleTime = 2 * time.Minute
	configuration.HealthCheckPeriod = time.Minute
	pool, err := pgxpool.NewWithConfig(ctx, configuration)
	if err != nil {
		return nil, ErrUnavailable
	}
	probe, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := pool.Ping(probe); err != nil {
		pool.Close()
		return nil, ErrUnavailable
	}
	return &Store{pool: pool, channelCipher: cipher}, nil
}

func (store *Store) Close() {
	if store != nil && store.pool != nil {
		store.pool.Close()
	}
}

func (store *Store) Health(ctx context.Context) error {
	if store == nil || store.pool == nil || store.pool.Ping(ctx) != nil {
		return ErrUnavailable
	}
	return nil
}

// HasRequiredTables reports whether every named table exists in the public
// schema. It is used by the authoritative/shadow startup gate to fail closed
// when migrations have not been applied, rather than discovering a missing
// table only on the first billing request. Table names are always static,
// developer-supplied constants - never derived from request input - so
// building the qualified name with string concatenation here is safe.
func (store *Store) HasRequiredTables(ctx context.Context, tables []string) (bool, error) {
	if store == nil || store.pool == nil {
		return false, ErrUnavailable
	}
	for _, table := range tables {
		var found *string
		if err := store.pool.QueryRow(ctx, "SELECT to_regclass('public.'||$1)::text", table).Scan(&found); err != nil {
			return false, ErrUnavailable
		}
		if found == nil {
			return false, nil
		}
	}
	return true, nil
}
