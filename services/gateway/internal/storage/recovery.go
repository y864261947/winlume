package storage

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// PendingSettlement identifies a usage event whose completion snapshot has
// already been durably persisted (status = 'settlement_pending') but whose
// release/debit transaction has not yet reached a terminal state. Settle is
// idempotent on terminal states, so the recovery worker can always call it
// again from this list without risking a double settlement.
type PendingSettlement struct {
	UsageEventID uuid.UUID
	OperationID  string
	AttemptCount int
}

// StaleReservation identifies a usage event that is still holding funds
// (status = 'reserved') with no completion snapshot ever recorded. Once past
// the recovery worker's staleness window these must be reversed so a crashed
// or abandoned request does not hold customer funds indefinitely.
type StaleReservation struct {
	UsageEventID uuid.UUID
	OperationID  string
	ReservedAt   time.Time
}

// ListSettlementPending returns settlement_pending usage events ordered by
// how long they have been waiting, oldest first, using the partial index
// created for this recovery path.
func (store *Store) ListSettlementPending(ctx context.Context, limit int) ([]PendingSettlement, error) {
	if store == nil || store.pool == nil || limit <= 0 {
		return nil, ErrUnavailable
	}
	rows, err := store.pool.Query(ctx, `
		SELECT id, COALESCE(operation_id, ''), settlement_attempt_count
		FROM usage_events
		WHERE status = 'settlement_pending'
		ORDER BY completion_snapshot_at ASC, id ASC
		LIMIT $1`, limit)
	if err != nil {
		return nil, ErrUnavailable
	}
	defer rows.Close()
	results := make([]PendingSettlement, 0, limit)
	for rows.Next() {
		var item PendingSettlement
		if err := rows.Scan(&item.UsageEventID, &item.OperationID, &item.AttemptCount); err != nil {
			return nil, ErrUnavailable
		}
		results = append(results, item)
	}
	if err := rows.Err(); err != nil {
		return nil, ErrUnavailable
	}
	return results, nil
}

// ListStaleReservations returns reserved usage events created before
// olderThan, oldest first, using the partial index created for this recovery
// path. A reserved event by definition has no completion snapshot, so no
// further filtering is required.
func (store *Store) ListStaleReservations(ctx context.Context, olderThan time.Time, limit int) ([]StaleReservation, error) {
	if store == nil || store.pool == nil || limit <= 0 {
		return nil, ErrUnavailable
	}
	rows, err := store.pool.Query(ctx, `
		SELECT id, COALESCE(operation_id, ''), created_at
		FROM usage_events
		WHERE status = 'reserved' AND created_at < $1
		ORDER BY created_at ASC, id ASC
		LIMIT $2`, olderThan, limit)
	if err != nil {
		return nil, ErrUnavailable
	}
	defer rows.Close()
	results := make([]StaleReservation, 0, limit)
	for rows.Next() {
		var item StaleReservation
		if err := rows.Scan(&item.UsageEventID, &item.OperationID, &item.ReservedAt); err != nil {
			return nil, ErrUnavailable
		}
		results = append(results, item)
	}
	if err := rows.Err(); err != nil {
		return nil, ErrUnavailable
	}
	return results, nil
}
