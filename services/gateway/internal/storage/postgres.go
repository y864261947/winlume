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

type Store struct{ pool *pgxpool.Pool }

func Open(ctx context.Context, databaseURL string) (*Store, error) {
	if strings.TrimSpace(databaseURL) == "" {
		return nil, ErrUnavailable
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
	return &Store{pool: pool}, nil
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
