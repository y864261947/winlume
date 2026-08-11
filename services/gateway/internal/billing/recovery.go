package billing

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"reizo/services/gateway/internal/observability"
	"reizo/services/gateway/internal/storage"
	"reizo/services/gateway/internal/usage"
)

const (
	// RecoveryInterval is how often the recovery worker re-runs after its
	// initial startup pass.
	RecoveryInterval = 30 * time.Second
	// DefaultRecoveryBatchLimit bounds how many events one pass processes per
	// category, so a large backlog cannot make a single pass unbounded.
	DefaultRecoveryBatchLimit = 200
	// DefaultStaleReservationWindow is how long a hold may sit in 'reserved'
	// with no completion snapshot before recovery reverses it. It is
	// deliberately generous: legitimate long-running streamed responses must
	// never be reversed out from under a request that is still in flight.
	DefaultStaleReservationWindow = 15 * time.Minute
)

// RecoveryRepository is the narrow storage surface the recovery worker needs.
// It reuses AuthoritativeRepository's Settle/Reverse/PersistCompletion so
// idempotent terminal-state handling stays in the one place that owns it:
// storage/billing.go.
type RecoveryRepository interface {
	ListSettlementPending(ctx context.Context, limit int) ([]storage.PendingSettlement, error)
	ListStaleReservations(ctx context.Context, olderThan time.Time, limit int) ([]storage.StaleReservation, error)
	PersistCompletion(ctx context.Context, snapshot storage.CompletionSnapshot) error
	Settle(ctx context.Context, usageEventID uuid.UUID) (storage.Settlement, error)
	Reverse(ctx context.Context, usageEventID uuid.UUID) error
}

// ErrRecoverySpoolUnavailable is returned when the local recovery spool
// cannot durably write, list, or delete an envelope.
var ErrRecoverySpoolUnavailable = errors.New("recovery spool unavailable")

// RecoverySpool is the local, owner-only durable spool used when even the
// completion snapshot could not reach Postgres.
type RecoverySpool interface {
	Write(ctx context.Context, envelope RecoveryEnvelope) error
	List() ([]RecoveryEnvelope, error)
	Delete(operationID string) error
}

// RecoveryEnvelope is the entire contents of one spool file. It intentionally
// carries only what recovery needs to finish a completion: no request body,
// generated content, raw API key, upstream credential, DSN, or arbitrary
// upstream error body is ever placed here.
type RecoveryEnvelope struct {
	OperationID      string          `json:"operation_id"`
	UsageEventID     string          `json:"usage_event_id"`
	CatalogVersionID string          `json:"catalog_version_id"`
	CanonicalUsage   json.RawMessage `json:"canonical_usage"`
	ActualQuota      int64           `json:"actual_quota"`
	CompletionState  string          `json:"completion_state"`
	Checksum         string          `json:"checksum"`
}

// checksum is computed over every field except itself, in a fixed field
// order, so tampering with any field in a spool file is detectable.
func (envelope RecoveryEnvelope) checksum() string {
	hash := sha256.New()
	writeField := func(value string) {
		hash.Write([]byte(value))
		hash.Write([]byte{0})
	}
	writeField(envelope.OperationID)
	writeField(envelope.UsageEventID)
	writeField(envelope.CatalogVersionID)
	hash.Write(envelope.CanonicalUsage)
	hash.Write([]byte{0})
	writeField(strconv.FormatInt(envelope.ActualQuota, 10))
	writeField(envelope.CompletionState)
	return hex.EncodeToString(hash.Sum(nil))
}

// valid reports whether the envelope has the minimum required identifiers and
// an intact checksum. Recovery must never act on a spool file it cannot
// verify byte-for-byte.
func (envelope RecoveryEnvelope) valid() bool {
	if strings.TrimSpace(envelope.OperationID) == "" || strings.TrimSpace(envelope.UsageEventID) == "" {
		return false
	}
	return envelope.Checksum == envelope.checksum()
}

// Spool implements RecoverySpool as owner-only local JSON files: directory
// mode 0700, file mode 0600, atomic write (temp file + rename), and both the
// file and its directory are fsynced before a write is considered durable.
type Spool struct {
	dir string
}

// NewSpool returns a Spool rooted at dir. dir is created on first write, not
// at construction time, so a shadow/off billing mode process never touches
// disk for a directory it will never use.
func NewSpool(dir string) *Spool {
	return &Spool{dir: strings.TrimSpace(dir)}
}

// Write atomically persists envelope, computing its checksum first.
func (spool *Spool) Write(_ context.Context, envelope RecoveryEnvelope) error {
	if spool == nil || strings.TrimSpace(spool.dir) == "" || strings.TrimSpace(envelope.OperationID) == "" || strings.TrimSpace(envelope.UsageEventID) == "" {
		return ErrRecoverySpoolUnavailable
	}
	if err := spool.ensureDir(); err != nil {
		return err
	}
	envelope.Checksum = envelope.checksum()
	payload, err := json.Marshal(envelope)
	if err != nil {
		return ErrRecoverySpoolUnavailable
	}

	temp, err := os.CreateTemp(spool.dir, ".recovery-*.tmp")
	if err != nil {
		return ErrRecoverySpoolUnavailable
	}
	tempPath := temp.Name()
	cleanupTemp := true
	defer func() {
		if cleanupTemp {
			_ = os.Remove(tempPath)
		}
	}()
	if err := temp.Chmod(0o600); err != nil {
		_ = temp.Close()
		return ErrRecoverySpoolUnavailable
	}
	if _, err := temp.Write(payload); err != nil {
		_ = temp.Close()
		return ErrRecoverySpoolUnavailable
	}
	if err := temp.Sync(); err != nil {
		_ = temp.Close()
		return ErrRecoverySpoolUnavailable
	}
	if err := temp.Close(); err != nil {
		return ErrRecoverySpoolUnavailable
	}

	finalPath := spool.pathFor(envelope.OperationID)
	if err := os.Rename(tempPath, finalPath); err != nil {
		return ErrRecoverySpoolUnavailable
	}
	cleanupTemp = false
	return spool.fsyncDir()
}

// List returns every envelope currently in the spool whose checksum is
// intact. A checksum-invalid file is skipped, not deleted or replayed, so it
// remains available for manual inspection.
func (spool *Spool) List() ([]RecoveryEnvelope, error) {
	if spool == nil || strings.TrimSpace(spool.dir) == "" {
		return nil, nil
	}
	entries, err := os.ReadDir(spool.dir)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, ErrRecoverySpoolUnavailable
	}
	envelopes := make([]RecoveryEnvelope, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		raw, readErr := os.ReadFile(filepath.Join(spool.dir, entry.Name()))
		if readErr != nil {
			continue
		}
		var envelope RecoveryEnvelope
		if jsonErr := json.Unmarshal(raw, &envelope); jsonErr != nil {
			continue
		}
		if !envelope.valid() {
			continue
		}
		envelopes = append(envelopes, envelope)
	}
	return envelopes, nil
}

// Delete removes the spool file for operationID. Callers must only call this
// after Postgres has confirmed the operation reached a terminal state.
func (spool *Spool) Delete(operationID string) error {
	if spool == nil || strings.TrimSpace(spool.dir) == "" || strings.TrimSpace(operationID) == "" {
		return ErrRecoverySpoolUnavailable
	}
	if err := os.Remove(spool.pathFor(operationID)); err != nil && !os.IsNotExist(err) {
		return ErrRecoverySpoolUnavailable
	}
	return spool.fsyncDir()
}

func (spool *Spool) pathFor(operationID string) string {
	return filepath.Join(spool.dir, operationID+".json")
}

func (spool *Spool) ensureDir() error {
	if err := os.MkdirAll(spool.dir, 0o700); err != nil {
		return ErrRecoverySpoolUnavailable
	}
	// MkdirAll applies the process umask, so force the exact owner-only mode
	// the plan requires regardless of umask.
	if err := os.Chmod(spool.dir, 0o700); err != nil {
		return ErrRecoverySpoolUnavailable
	}
	return nil
}

// fsyncDir fsyncs the spool directory so a durable file rename survives a
// crash even if the directory entry itself had not reached disk. Windows
// does not support syncing a directory handle at all (FlushFileBuffers on a
// directory handle fails with "Access is denied"); on that platform this is
// a documented, permanent OS limitation rather than a transient failure, so
// it is treated as best-effort there. The file itself is still fsynced
// before rename on every platform, and NTFS's metadata journal makes the
// rename durable without an explicit directory fsync.
func (spool *Spool) fsyncDir() error {
	directory, err := os.Open(spool.dir)
	if err != nil {
		return ErrRecoverySpoolUnavailable
	}
	defer directory.Close()
	if err := directory.Sync(); err != nil && runtime.GOOS != "windows" {
		return ErrRecoverySpoolUnavailable
	}
	return nil
}

// RecoveryStats reports the outcome of one or more recovery passes. Recovery
// must produce exactly one terminal ledger outcome per operation, so callers
// should expect Settled+Reversed+Skipped+Deferred+Errors to account for every
// event a pass looked at.
type RecoveryStats struct {
	Attempts       int64
	Settled        int64
	Replayed       int64
	Reversed       int64
	Skipped        int64
	Deferred       int64
	Errors         int64
	LastErrorClass string
}

// RecoveryOption configures a RecoveryWorker at construction time.
type RecoveryOption func(*RecoveryWorker)

// WithRecoveryLogger attaches a logger for sanitized recovery failure events.
func WithRecoveryLogger(logger *observability.Logger) RecoveryOption {
	return func(worker *RecoveryWorker) { worker.logger = logger }
}

// WithStaleReservationWindow overrides DefaultStaleReservationWindow.
func WithStaleReservationWindow(window time.Duration) RecoveryOption {
	return func(worker *RecoveryWorker) {
		if window > 0 {
			worker.staleAfter = window
		}
	}
}

// WithRecoveryBatchLimit overrides DefaultRecoveryBatchLimit.
func WithRecoveryBatchLimit(limit int) RecoveryOption {
	return func(worker *RecoveryWorker) {
		if limit > 0 {
			worker.batchLimit = limit
		}
	}
}

// WithRecoveryClock overrides the worker's notion of "now", for deterministic
// staleness tests.
func WithRecoveryClock(now func() time.Time) RecoveryOption {
	return func(worker *RecoveryWorker) {
		if now != nil {
			worker.now = now
		}
	}
}

// RecoveryWorker durably finishes authoritative billing operations that a
// crash, database outage, or process restart interrupted mid-lifecycle. On
// startup and every RecoveryInterval it: settles settlement_pending events
// from their already-frozen snapshot, replays local spool envelopes, and
// reverses expired reserved holds that never received a completion snapshot.
// It relies on storage/billing.go's Settle/Reverse/PersistCompletion already
// being idempotent on terminal states, so running twice or replaying the same
// envelope twice cannot double-settle or double-reverse an operation.
type RecoveryWorker struct {
	store      RecoveryRepository
	spool      RecoverySpool
	logger     *observability.Logger
	staleAfter time.Duration
	batchLimit int
	now        func() time.Time

	mu    sync.Mutex
	stats RecoveryStats
}

// NewRecoveryWorker constructs a worker. store may be nil only in tests that
// exercise the nil-safety guard; spool may be nil when the process has no
// configured recovery directory (e.g. billing mode is off or shadow).
func NewRecoveryWorker(store RecoveryRepository, spool RecoverySpool, options ...RecoveryOption) *RecoveryWorker {
	worker := &RecoveryWorker{
		store:      store,
		spool:      spool,
		staleAfter: DefaultStaleReservationWindow,
		batchLimit: DefaultRecoveryBatchLimit,
		now:        time.Now,
	}
	for _, option := range options {
		option(worker)
	}
	return worker
}

// Run performs an immediate pass, then repeats every RecoveryInterval until
// ctx is cancelled.
func (worker *RecoveryWorker) Run(ctx context.Context) {
	worker.RunOnce(ctx)
	ticker := time.NewTicker(RecoveryInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			worker.RunOnce(ctx)
		}
	}
}

// RunOnce runs the settle, replay, and reverse passes once and returns this
// pass's stats. Cumulative stats are available from Stats.
func (worker *RecoveryWorker) RunOnce(ctx context.Context) RecoveryStats {
	var pass RecoveryStats
	if worker == nil || worker.store == nil {
		return pass
	}
	worker.settlePending(ctx, &pass)
	worker.replaySpool(ctx, &pass)
	worker.reverseStale(ctx, &pass)
	worker.merge(pass)
	return pass
}

// Stats returns cumulative counters across every RunOnce call so far.
func (worker *RecoveryWorker) Stats() RecoveryStats {
	worker.mu.Lock()
	defer worker.mu.Unlock()
	return worker.stats
}

func (worker *RecoveryWorker) merge(pass RecoveryStats) {
	worker.mu.Lock()
	defer worker.mu.Unlock()
	worker.stats.Attempts += pass.Attempts
	worker.stats.Settled += pass.Settled
	worker.stats.Replayed += pass.Replayed
	worker.stats.Reversed += pass.Reversed
	worker.stats.Skipped += pass.Skipped
	worker.stats.Deferred += pass.Deferred
	worker.stats.Errors += pass.Errors
	if pass.LastErrorClass != "" {
		worker.stats.LastErrorClass = pass.LastErrorClass
	}
}

// fail records a failure using only a static, known-safe event name. It
// never derives the sanitized class from err.Error(), because an arbitrary
// storage error may embed a DSN, connection string, or other value this
// package must never surface in logs or metrics.
func (worker *RecoveryWorker) fail(pass *RecoveryStats, event string) {
	pass.Errors++
	class := sanitizeErrorClass(event)
	pass.LastErrorClass = class
	if worker.logger != nil {
		worker.logger.Error(context.Background(), "gateway billing recovery pass failed", observability.Fields{ErrorClass: class})
	}
}

func (worker *RecoveryWorker) settlePending(ctx context.Context, pass *RecoveryStats) {
	pending, err := worker.store.ListSettlementPending(ctx, worker.batchLimit)
	if err != nil {
		worker.fail(pass, "recovery_settlement_pending_list_failed")
		return
	}
	for _, item := range pending {
		pass.Attempts++
		_, settleErr := worker.store.Settle(ctx, item.UsageEventID)
		switch {
		case settleErr == nil:
			pass.Settled++
		case errors.Is(settleErr, storage.ErrOperationAlreadyCompleted):
			pass.Skipped++
		case errors.Is(settleErr, storage.ErrInsufficientFunds):
			pass.Deferred++
		default:
			worker.fail(pass, "recovery_settle_failed")
		}
	}
}

func (worker *RecoveryWorker) reverseStale(ctx context.Context, pass *RecoveryStats) {
	cutoff := worker.now().Add(-worker.staleAfter)
	stale, err := worker.store.ListStaleReservations(ctx, cutoff, worker.batchLimit)
	if err != nil {
		worker.fail(pass, "recovery_stale_reservation_list_failed")
		return
	}
	for _, item := range stale {
		pass.Attempts++
		reverseErr := worker.store.Reverse(ctx, item.UsageEventID)
		switch {
		case reverseErr == nil:
			pass.Reversed++
		case errors.Is(reverseErr, storage.ErrOperationAlreadyCompleted), errors.Is(reverseErr, storage.ErrOperationInFlight):
			// A settlement raced ahead of recovery (or another pass already
			// reversed it). A committed settlement must never be reversed.
			pass.Skipped++
		default:
			worker.fail(pass, "recovery_reverse_failed")
		}
	}
}

func (worker *RecoveryWorker) replaySpool(ctx context.Context, pass *RecoveryStats) {
	if worker.spool == nil {
		return
	}
	envelopes, err := worker.spool.List()
	if err != nil {
		worker.fail(pass, "recovery_spool_list_failed")
		return
	}
	for _, envelope := range envelopes {
		worker.replayEnvelope(ctx, pass, envelope)
	}
}

func (worker *RecoveryWorker) replayEnvelope(ctx context.Context, pass *RecoveryStats, envelope RecoveryEnvelope) {
	pass.Attempts++
	usageEventID, err := uuid.Parse(envelope.UsageEventID)
	if err != nil {
		worker.fail(pass, "recovery_spool_envelope_invalid")
		return
	}
	var canonical usage.Canonical
	if err := json.Unmarshal(envelope.CanonicalUsage, &canonical); err != nil {
		worker.fail(pass, "recovery_spool_envelope_invalid")
		return
	}
	provenance, err := json.Marshal(canonical.Fields)
	if err != nil {
		worker.fail(pass, "recovery_spool_envelope_invalid")
		return
	}

	persistErr := worker.store.PersistCompletion(ctx, storage.CompletionSnapshot{
		UsageEventID:    usageEventID,
		CanonicalUsage:  envelope.CanonicalUsage,
		UsageProvenance: provenance,
		CompletionState: envelope.CompletionState,
		ActualQuota:     envelope.ActualQuota,
		InputTokens:     canonical.TextInputTokens,
		OutputTokens:    canonical.TextOutputTokens,
		TotalTokens:     totalTokens(canonical),
	})
	if persistErr != nil && !errors.Is(persistErr, storage.ErrOperationAlreadyCompleted) {
		worker.fail(pass, "recovery_spool_persist_failed")
		return
	}

	_, settleErr := worker.store.Settle(ctx, usageEventID)
	switch {
	case settleErr == nil, errors.Is(settleErr, storage.ErrOperationAlreadyCompleted):
		// Postgres now has a terminal outcome for this operation: delete the
		// spool file, whether that outcome was settled here or already
		// finished (settled/reversed/failed) by another path.
		if deleteErr := worker.spool.Delete(envelope.OperationID); deleteErr != nil {
			worker.fail(pass, "recovery_spool_delete_failed")
			return
		}
		if settleErr == nil {
			pass.Replayed++
		} else {
			pass.Skipped++
		}
	case errors.Is(settleErr, storage.ErrInsufficientFunds):
		// Not yet terminal. The persisted snapshot is now durable in
		// Postgres regardless, but the plan requires deleting the spool file
		// only once Postgres confirms a terminal state, so keep it.
		pass.Deferred++
	default:
		worker.fail(pass, "recovery_spool_settle_failed")
	}
}
