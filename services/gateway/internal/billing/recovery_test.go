package billing

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"winlume/services/gateway/internal/storage"
)

// --- fakes -----------------------------------------------------------------

type recoveryStoreFake struct {
	mu sync.Mutex

	pending []storage.PendingSettlement
	stale   []storage.StaleReservation

	settleCalls  []uuid.UUID
	reverseCalls []uuid.UUID
	persistCalls []storage.CompletionSnapshot

	settleErr    map[uuid.UUID]error
	reverseErr   map[uuid.UUID]error
	persistErr   error
	listPendErr  error
	listStaleErr error

	settled  map[uuid.UUID]bool
	reversed map[uuid.UUID]bool
}

func newRecoveryStoreFake() *recoveryStoreFake {
	return &recoveryStoreFake{
		settleErr:  map[uuid.UUID]error{},
		reverseErr: map[uuid.UUID]error{},
		settled:    map[uuid.UUID]bool{},
		reversed:   map[uuid.UUID]bool{},
	}
}

func (fake *recoveryStoreFake) ListSettlementPending(context.Context, int) ([]storage.PendingSettlement, error) {
	fake.mu.Lock()
	defer fake.mu.Unlock()
	if fake.listPendErr != nil {
		return nil, fake.listPendErr
	}
	return fake.pending, nil
}

func (fake *recoveryStoreFake) ListStaleReservations(context.Context, time.Time, int) ([]storage.StaleReservation, error) {
	fake.mu.Lock()
	defer fake.mu.Unlock()
	if fake.listStaleErr != nil {
		return nil, fake.listStaleErr
	}
	return fake.stale, nil
}

func (fake *recoveryStoreFake) PersistCompletion(_ context.Context, snapshot storage.CompletionSnapshot) error {
	fake.mu.Lock()
	defer fake.mu.Unlock()
	fake.persistCalls = append(fake.persistCalls, snapshot)
	return fake.persistErr
}

func (fake *recoveryStoreFake) Settle(_ context.Context, usageEventID uuid.UUID) (storage.Settlement, error) {
	fake.mu.Lock()
	defer fake.mu.Unlock()
	fake.settleCalls = append(fake.settleCalls, usageEventID)
	if err := fake.settleErr[usageEventID]; err != nil {
		return storage.Settlement{}, err
	}
	fake.settled[usageEventID] = true
	return storage.Settlement{UsageEventID: usageEventID, ActualQuota: 42, Status: "settled"}, nil
}

func (fake *recoveryStoreFake) Reverse(_ context.Context, usageEventID uuid.UUID) error {
	fake.mu.Lock()
	defer fake.mu.Unlock()
	fake.reverseCalls = append(fake.reverseCalls, usageEventID)
	if err := fake.reverseErr[usageEventID]; err != nil {
		return err
	}
	fake.reversed[usageEventID] = true
	return nil
}

// --- settlement pending ------------------------------------------------------

func TestRecoveryWorkerSettlesPendingEventsFromStorage(t *testing.T) {
	store := newRecoveryStoreFake()
	eventID := uuid.New()
	store.pending = []storage.PendingSettlement{{UsageEventID: eventID}}
	worker := NewRecoveryWorker(store, nil)

	stats := worker.RunOnce(context.Background())

	require.Equal(t, []uuid.UUID{eventID}, store.settleCalls)
	require.Equal(t, int64(1), stats.Settled)
	require.True(t, store.settled[eventID])
}

func TestRecoveryWorkerSkipsSettlementAlreadyTerminal(t *testing.T) {
	store := newRecoveryStoreFake()
	eventID := uuid.New()
	store.pending = []storage.PendingSettlement{{UsageEventID: eventID}}
	store.settleErr[eventID] = storage.ErrOperationAlreadyCompleted
	worker := NewRecoveryWorker(store, nil)

	stats := worker.RunOnce(context.Background())

	require.Equal(t, int64(1), stats.Skipped)
	require.Equal(t, int64(0), stats.Errors)
}

func TestRecoveryWorkerDefersSettlementOnInsufficientFunds(t *testing.T) {
	store := newRecoveryStoreFake()
	eventID := uuid.New()
	store.pending = []storage.PendingSettlement{{UsageEventID: eventID}}
	store.settleErr[eventID] = storage.ErrInsufficientFunds
	worker := NewRecoveryWorker(store, nil)

	stats := worker.RunOnce(context.Background())

	require.Equal(t, int64(1), stats.Deferred)
	require.Equal(t, int64(0), stats.Errors)
}

func TestRecoveryWorkerRecordsSanitizedErrorClassOnUnexpectedSettleFailure(t *testing.T) {
	store := newRecoveryStoreFake()
	eventID := uuid.New()
	store.pending = []storage.PendingSettlement{{UsageEventID: eventID}}
	store.settleErr[eventID] = errors.New("connection reset by peer: dsn=postgres://user:pw@host/db")
	worker := NewRecoveryWorker(store, nil)

	stats := worker.RunOnce(context.Background())

	require.Equal(t, int64(1), stats.Errors)
	require.NotEmpty(t, stats.LastErrorClass)
	require.NotContains(t, stats.LastErrorClass, "postgres://")
	require.NotContains(t, stats.LastErrorClass, "dsn")
}

// --- stale reservations ------------------------------------------------------

func TestRecoveryWorkerReversesStaleReservationsWithoutACompletionSnapshot(t *testing.T) {
	store := newRecoveryStoreFake()
	eventID := uuid.New()
	store.stale = []storage.StaleReservation{{UsageEventID: eventID, ReservedAt: time.Now().Add(-time.Hour)}}
	worker := NewRecoveryWorker(store, nil)

	stats := worker.RunOnce(context.Background())

	require.Equal(t, []uuid.UUID{eventID}, store.reverseCalls)
	require.Equal(t, int64(1), stats.Reversed)
	require.True(t, store.reversed[eventID])
}

func TestRecoveryWorkerNeverTreatsAnAlreadySettledStaleCandidateAsReversed(t *testing.T) {
	store := newRecoveryStoreFake()
	eventID := uuid.New()
	store.stale = []storage.StaleReservation{{UsageEventID: eventID}}
	store.reverseErr[eventID] = storage.ErrOperationAlreadyCompleted
	worker := NewRecoveryWorker(store, nil)

	stats := worker.RunOnce(context.Background())

	require.Equal(t, int64(1), stats.Skipped)
	require.Equal(t, int64(0), stats.Reversed)
}

func TestRecoveryWorkerUsesTheStaleWindowWhenQueryingReservations(t *testing.T) {
	store := newRecoveryStoreFake()
	var capturedCutoff time.Time
	fakeNow := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	worker := NewRecoveryWorker(&capturingStore{recoveryStoreFake: store, onListStale: func(cutoff time.Time) { capturedCutoff = cutoff }}, nil,
		WithStaleReservationWindow(10*time.Minute), WithRecoveryClock(func() time.Time { return fakeNow }))

	worker.RunOnce(context.Background())

	require.Equal(t, fakeNow.Add(-10*time.Minute), capturedCutoff)
}

type capturingStore struct {
	*recoveryStoreFake
	onListStale func(time.Time)
}

func (store *capturingStore) ListStaleReservations(ctx context.Context, olderThan time.Time, limit int) ([]storage.StaleReservation, error) {
	if store.onListStale != nil {
		store.onListStale(olderThan)
	}
	return store.recoveryStoreFake.ListStaleReservations(ctx, olderThan, limit)
}

// --- spool replay -------------------------------------------------------------

func recoveryEnvelopeFor(t *testing.T, usageEventID uuid.UUID, actualQuota int64) RecoveryEnvelope {
	t.Helper()
	canonicalUsage, err := json.Marshal(map[string]any{
		"text_input_tokens": 10, "text_output_tokens": 5, "fields": map[string]string{},
	})
	require.NoError(t, err)
	envelope := RecoveryEnvelope{
		OperationID:      uuid.NewString(),
		UsageEventID:     usageEventID.String(),
		CatalogVersionID: uuid.NewString(),
		CanonicalUsage:   canonicalUsage,
		ActualQuota:      actualQuota,
		CompletionState:  "message_stop",
	}
	envelope.Checksum = envelope.checksum()
	return envelope
}

type spoolFake struct {
	mu        sync.Mutex
	envelopes []RecoveryEnvelope
	deleted   []string
	listErr   error
	deleteErr error
}

func (spool *spoolFake) List() ([]RecoveryEnvelope, error) {
	spool.mu.Lock()
	defer spool.mu.Unlock()
	if spool.listErr != nil {
		return nil, spool.listErr
	}
	return append([]RecoveryEnvelope(nil), spool.envelopes...), nil
}

func (spool *spoolFake) Write(_ context.Context, envelope RecoveryEnvelope) error {
	spool.mu.Lock()
	defer spool.mu.Unlock()
	spool.envelopes = append(spool.envelopes, envelope)
	return nil
}

func (spool *spoolFake) Delete(operationID string) error {
	spool.mu.Lock()
	defer spool.mu.Unlock()
	if spool.deleteErr != nil {
		return spool.deleteErr
	}
	spool.deleted = append(spool.deleted, operationID)
	kept := spool.envelopes[:0]
	for _, envelope := range spool.envelopes {
		if envelope.OperationID != operationID {
			kept = append(kept, envelope)
		}
	}
	spool.envelopes = kept
	return nil
}

func TestRecoveryWorkerReplaysASpoolEnvelopeThenDeletesItAfterSettlement(t *testing.T) {
	store := newRecoveryStoreFake()
	eventID := uuid.New()
	envelope := recoveryEnvelopeFor(t, eventID, 77)
	spool := &spoolFake{envelopes: []RecoveryEnvelope{envelope}}
	worker := NewRecoveryWorker(store, spool)

	stats := worker.RunOnce(context.Background())

	require.Equal(t, int64(1), stats.Replayed)
	require.Len(t, store.persistCalls, 1)
	require.Equal(t, eventID, store.persistCalls[0].UsageEventID)
	require.Equal(t, int64(77), store.persistCalls[0].ActualQuota)
	require.Equal(t, []string{envelope.OperationID}, spool.deleted)
	require.Empty(t, spool.envelopes)
}

func TestRecoveryWorkerKeepsTheSpoolEnvelopeWhenSettlementIsNotYetTerminal(t *testing.T) {
	store := newRecoveryStoreFake()
	eventID := uuid.New()
	store.settleErr[eventID] = storage.ErrInsufficientFunds
	envelope := recoveryEnvelopeFor(t, eventID, 77)
	spool := &spoolFake{envelopes: []RecoveryEnvelope{envelope}}
	worker := NewRecoveryWorker(store, spool)

	stats := worker.RunOnce(context.Background())

	require.Equal(t, int64(1), stats.Deferred)
	require.Equal(t, int64(0), stats.Replayed)
	require.Empty(t, spool.deleted)
	require.Len(t, spool.envelopes, 1, "spool file must survive until Postgres confirms a terminal state")
}

func TestRecoveryWorkerReplayIsIdempotentAcrossTwoPasses(t *testing.T) {
	store := newRecoveryStoreFake()
	eventID := uuid.New()
	envelope := recoveryEnvelopeFor(t, eventID, 77)
	spool := &spoolFake{envelopes: []RecoveryEnvelope{envelope}}
	worker := NewRecoveryWorker(store, spool)

	worker.RunOnce(context.Background())
	worker.RunOnce(context.Background())

	require.Len(t, store.settleCalls, 1, "the second pass must not find a spool file to replay")
}

func TestRecoveryWorkerDeletesASpoolEnvelopeWhenPostgresAlreadyReversedTheOperation(t *testing.T) {
	store := newRecoveryStoreFake()
	eventID := uuid.New()
	store.persistErr = storage.ErrOperationAlreadyCompleted
	store.settleErr[eventID] = storage.ErrOperationAlreadyCompleted
	envelope := recoveryEnvelopeFor(t, eventID, 77)
	spool := &spoolFake{envelopes: []RecoveryEnvelope{envelope}}
	worker := NewRecoveryWorker(store, spool)

	stats := worker.RunOnce(context.Background())

	require.Equal(t, int64(1), stats.Skipped)
	require.Empty(t, spool.envelopes)
}

// --- envelope checksum / spool file I/O ---------------------------------------

func TestRecoveryEnvelopeChecksumDetectsTampering(t *testing.T) {
	envelope := recoveryEnvelopeFor(t, uuid.New(), 10)
	require.True(t, envelope.valid())

	tampered := envelope
	tampered.ActualQuota = 999
	require.False(t, tampered.valid())
}

func TestSpoolWriteListDeleteRoundTrip(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "recovery")
	spool := NewSpool(dir)
	envelope := recoveryEnvelopeFor(t, uuid.New(), 55)

	require.NoError(t, spool.Write(context.Background(), envelope))

	info, err := os.Stat(dir)
	require.NoError(t, err)
	entries, err := os.ReadDir(dir)
	require.NoError(t, err)
	require.Len(t, entries, 1)
	fileInfo, err := entries[0].Info()
	require.NoError(t, err)
	// Windows does not map POSIX mode bits onto NTFS ACLs the way os.Chmod
	// does on POSIX, so the exact 0700/0600 bits can only be verified on a
	// POSIX runtime. The chmod calls themselves are unconditional in
	// recovery.go and take effect on the Linux hosts this service runs on.
	if runtime.GOOS != "windows" {
		require.Equal(t, os.FileMode(0700), info.Mode().Perm())
		require.Equal(t, os.FileMode(0600), fileInfo.Mode().Perm())
	}

	loaded, err := spool.List()
	require.NoError(t, err)
	require.Len(t, loaded, 1)
	require.Equal(t, envelope.OperationID, loaded[0].OperationID)
	require.Equal(t, envelope.ActualQuota, loaded[0].ActualQuota)

	require.NoError(t, spool.Delete(envelope.OperationID))
	remaining, err := spool.List()
	require.NoError(t, err)
	require.Empty(t, remaining)
}

func TestSpoolListSkipsACorruptedEnvelopeWithoutActingOnIt(t *testing.T) {
	dir := t.TempDir()
	spool := NewSpool(dir)
	envelope := recoveryEnvelopeFor(t, uuid.New(), 55)
	require.NoError(t, spool.Write(context.Background(), envelope))

	entries, err := os.ReadDir(dir)
	require.NoError(t, err)
	require.Len(t, entries, 1)
	corruptedPath := filepath.Join(dir, entries[0].Name())
	raw, err := os.ReadFile(corruptedPath)
	require.NoError(t, err)
	var stored RecoveryEnvelope
	require.NoError(t, json.Unmarshal(raw, &stored))
	stored.ActualQuota = 999999
	tamperedBytes, err := json.Marshal(stored)
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(corruptedPath, tamperedBytes, 0600))

	loaded, err := spool.List()
	require.NoError(t, err)
	require.Empty(t, loaded, "a checksum-invalid envelope must never be replayed")

	// The corrupted file itself must be left untouched for manual inspection.
	_, statErr := os.Stat(corruptedPath)
	require.NoError(t, statErr)
}

// --- worker composition -------------------------------------------------------

func TestRecoveryWorkerRunOnceCoversAllThreePassesInOneCall(t *testing.T) {
	store := newRecoveryStoreFake()
	pendingID, staleID, replayID := uuid.New(), uuid.New(), uuid.New()
	store.pending = []storage.PendingSettlement{{UsageEventID: pendingID}}
	store.stale = []storage.StaleReservation{{UsageEventID: staleID}}
	envelope := recoveryEnvelopeFor(t, replayID, 10)
	spool := &spoolFake{envelopes: []RecoveryEnvelope{envelope}}
	worker := NewRecoveryWorker(store, spool)

	stats := worker.RunOnce(context.Background())

	require.Equal(t, int64(1), stats.Settled)
	require.Equal(t, int64(1), stats.Reversed)
	require.Equal(t, int64(1), stats.Replayed)
}

func TestRecoveryWorkerStatsAccumulateAcrossPasses(t *testing.T) {
	store := newRecoveryStoreFake()
	eventID := uuid.New()
	store.pending = []storage.PendingSettlement{{UsageEventID: eventID}}
	worker := NewRecoveryWorker(store, nil)

	worker.RunOnce(context.Background())
	store.pending = nil
	worker.RunOnce(context.Background())

	require.Equal(t, int64(1), worker.Stats().Settled)
}

func TestRecoveryWorkerRunStopsWhenContextIsCancelled(t *testing.T) {
	store := newRecoveryStoreFake()
	worker := NewRecoveryWorker(store, nil)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	done := make(chan struct{})
	go func() {
		worker.Run(ctx)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not return after context cancellation")
	}
}

func TestNewRecoveryWorkerIsNilSafeWithoutAStore(t *testing.T) {
	worker := NewRecoveryWorker(nil, nil)
	stats := worker.RunOnce(context.Background())
	require.Equal(t, RecoveryStats{}, stats)
}
