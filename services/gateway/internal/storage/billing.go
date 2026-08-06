package storage

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
)

var (
	ErrInsufficientFunds         = errors.New("insufficient billing quota")
	ErrOperationInFlight         = errors.New("billing operation already in flight")
	ErrOperationAlreadyCompleted = errors.New("billing operation already completed")
)

// Reserve, Settle and Reverse all run at pgx.Serializable. PostgreSQL's
// serializable snapshot isolation may cancel one of two legitimately
// concurrent transactions with SQLSTATE 40001 ("could not serialize access
// due to read/write dependencies", whose own hint is "The transaction might
// succeed if retried") or 40P01 (deadlock detected). Those two codes - and
// only those two - are retried, each attempt as a completely fresh
// transaction. Every other failure, including context cancellation and any
// business-level error, is returned to the caller immediately.
const (
	maxSerializableAttempts = 4
	serializableRetryDelay  = 5 * time.Millisecond
)

const (
	sqlStateSerializationFailure = "40001"
	sqlStateDeadlockDetected     = "40P01"
)

// serializationFailure marks a database error the caller may safely retry. It
// never escapes this package: withSerializableRetry either retries it or
// converts it to ErrUnavailable once the attempt budget is spent.
type serializationFailure struct{ err error }

func (failure *serializationFailure) Error() string { return failure.err.Error() }

func (failure *serializationFailure) Unwrap() error { return failure.err }

// txFailure classifies a raw database error. A serialization/deadlock failure
// becomes a retryable marker; everything else keeps this package's existing
// opaque ErrUnavailable contract so no driver detail reaches the caller.
func txFailure(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && (pgErr.Code == sqlStateSerializationFailure || pgErr.Code == sqlStateDeadlockDetected) {
		return &serializationFailure{err: err}
	}
	return ErrUnavailable
}

// withSerializableRetry runs attempt until it succeeds, fails with a
// non-retryable error, or exhausts the bounded attempt budget. attempt must
// begin its own transaction so every retry observes a fresh snapshot.
func withSerializableRetry(ctx context.Context, attempt func() error) error {
	for attemptNumber := 1; ; attemptNumber++ {
		err := attempt()
		var retryable *serializationFailure
		if !errors.As(err, &retryable) {
			return err
		}
		if attemptNumber >= maxSerializableAttempts || ctx.Err() != nil {
			return ErrUnavailable
		}
		timer := time.NewTimer(serializableRetryDelay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ErrUnavailable
		case <-timer.C:
		}
	}
}

type FundingKind string

const (
	FundingWallet       FundingKind = "wallet"
	FundingSubscription FundingKind = "subscription"
)

// ReservationRequest contains only frozen numeric billing inputs. It must not
// carry raw API keys, request bodies, upstream credentials, or error bodies.
type ReservationRequest struct {
	OperationID      uuid.UUID
	RequestID        string
	IdempotencyKey   string
	UserID           uuid.UUID
	OrganizationID   *uuid.UUID
	APIKeyID         *uuid.UUID
	APIKeyUnlimited  bool
	APIKeyQuotaLimit *int64
	CatalogVersionID uuid.UUID
	Provider         string
	Model            string
	ReservedQuota    int64
	PricingQuote     json.RawMessage
}

type Reservation struct {
	UsageEventID     uuid.UUID
	FundingKind      FundingKind
	FundingReference string
	ReservedQuota    int64
}

// CompletionSnapshot is persisted before settlement. It is the durable input
// used by future recovery, not a copy of the request or response body.
type CompletionSnapshot struct {
	UsageEventID    uuid.UUID
	CanonicalUsage  json.RawMessage
	UsageProvenance json.RawMessage
	CompletionState string
	ActualQuota     int64
	InputTokens     int64
	OutputTokens    int64
	TotalTokens     int64
	ChannelCost     *int64
	ProfitQuota     *int64
}

type Settlement struct {
	UsageEventID uuid.UUID
	ActualQuota  int64
	Status       string
}

// RelayAttemptRecord is the sanitized, per-attempt audit row persisted
// alongside a shared billing operation's usage event. It must never carry a
// request or response body, upstream credential, channel URL, or raw error
// text - only enough to reconstruct retry behavior after the fact.
type RelayAttemptRecord struct {
	UsageEventID        uuid.UUID
	AttemptNumber       int
	ChannelID           string
	ProviderType        int
	Status              string
	RetryReason         string
	SanitizedErrorClass string
	StartedAt           time.Time
	CompletedAt         *time.Time
}

type usageEvent struct {
	ID            uuid.UUID
	UserID        uuid.UUID
	APIKeyID      *uuid.UUID
	Status        string
	FundingKind   string
	FundingRef    string
	ReservedQuota int64
	ActualQuota   *int64
	APIKeyBounded bool
}

type subscriptionState struct {
	ID                 uuid.UUID
	WindowStartedAt    time.Time
	WindowEndsAt       time.Time
	NextResetAt        time.Time
	WindowQuotaLimit   pgtype.Int8
	WindowConsumed     int64
	CumulativeLimit    pgtype.Int8
	CumulativeConsumed int64
}

func (store *Store) Reserve(ctx context.Context, request ReservationRequest) (Reservation, error) {
	if store == nil || store.pool == nil || request.OperationID == uuid.Nil || request.UserID == uuid.Nil || request.CatalogVersionID == uuid.Nil || request.ReservedQuota < 0 || strings.TrimSpace(request.RequestID) == "" || strings.TrimSpace(request.Model) == "" || len(request.PricingQuote) == 0 || !json.Valid(request.PricingQuote) {
		return Reservation{}, ErrUnavailable
	}
	if request.APIKeyID != nil && !request.APIKeyUnlimited && request.APIKeyQuotaLimit == nil {
		return Reservation{}, ErrUnavailable
	}
	var reservation Reservation
	// Each attempt re-runs reserveAttempt from scratch, which mints a fresh
	// usageEventID while keeping the caller's OperationID. The failed attempt
	// rolled back, so usage_events_operation_id_unique still sees exactly one
	// row per operation and a genuine duplicate operation is still a clean
	// conflict rather than a retry.
	if err := withSerializableRetry(ctx, func() error {
		var attemptErr error
		reservation, attemptErr = store.reserveAttempt(ctx, request)
		return attemptErr
	}); err != nil {
		return Reservation{}, err
	}
	return reservation, nil
}

func (store *Store) reserveAttempt(ctx context.Context, request ReservationRequest) (Reservation, error) {
	tx, err := store.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return Reservation{}, txFailure(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := lockUser(ctx, tx, request.UserID); err != nil {
		return Reservation{}, txFailure(err)
	}
	if request.IdempotencyKey != "" {
		if err := loadIdempotentOperation(ctx, tx, request.UserID, request.IdempotencyKey); err != nil {
			return Reservation{}, err
		}
	}

	apiKeyBounded := request.APIKeyID != nil && !request.APIKeyUnlimited
	metadata, err := reservationMetadata(request.PricingQuote, apiKeyBounded)
	if err != nil {
		return Reservation{}, ErrUnavailable
	}
	usageEventID := uuid.New()
	provider := strings.TrimSpace(request.Provider)
	if provider == "" {
		provider = "gateway"
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO usage_events (
			id, user_id, organization_id, api_key_id, catalog_version_id, idempotency_key,
			request_id, provider, model, status, funding_kind, funding_reference,
			reserved_quota, operation_id, metadata
		) VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), $7, $8, $9, 'reserved', 'pending', 'pending', $10, $11, $12)`,
		usageEventID, request.UserID, request.OrganizationID, request.APIKeyID, request.CatalogVersionID,
		request.IdempotencyKey, request.RequestID, provider, request.Model, request.ReservedQuota, request.OperationID.String(), metadata,
	); err != nil {
		return Reservation{}, txFailure(err)
	}
	if err := reserveAPIKeyQuota(ctx, tx, request, usageEventID, apiKeyBounded); err != nil {
		return Reservation{}, err
	}

	kind, reference, err := store.reserveFunding(ctx, tx, usageEventID, request.UserID, request.OperationID, request.ReservedQuota)
	if err != nil {
		return Reservation{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE usage_events SET funding_kind = $2, funding_reference = $3, updated_at = now() WHERE id = $1`, usageEventID, kind, reference); err != nil {
		return Reservation{}, txFailure(err)
	}
	if err := tx.Commit(ctx); err != nil {
		return Reservation{}, txFailure(err)
	}
	return Reservation{UsageEventID: usageEventID, FundingKind: kind, FundingReference: reference, ReservedQuota: request.ReservedQuota}, nil
}

func (store *Store) PersistCompletion(ctx context.Context, snapshot CompletionSnapshot) error {
	if store == nil || store.pool == nil || snapshot.UsageEventID == uuid.Nil || snapshot.ActualQuota < 0 || snapshot.InputTokens < 0 || snapshot.OutputTokens < 0 || snapshot.TotalTokens < 0 || strings.TrimSpace(snapshot.CompletionState) == "" || len(snapshot.CanonicalUsage) == 0 || len(snapshot.UsageProvenance) == 0 || !json.Valid(snapshot.CanonicalUsage) || !json.Valid(snapshot.UsageProvenance) {
		return ErrUnavailable
	}
	command, err := store.pool.Exec(ctx, `
		UPDATE usage_events
		SET status = 'settlement_pending', canonical_usage = $2, usage_provenance = $3,
			completion_state = $4, actual_quota = $5, input_tokens = $6,
			output_tokens = $7, total_tokens = $8, cost_microcredits = $5,
			channel_cost_quota = $9, profit_quota = $10, completion_snapshot_at = now(), updated_at = now()
		WHERE id = $1 AND status = 'reserved'`,
		snapshot.UsageEventID, snapshot.CanonicalUsage, snapshot.UsageProvenance, snapshot.CompletionState,
		snapshot.ActualQuota, snapshot.InputTokens, snapshot.OutputTokens, snapshot.TotalTokens,
		snapshot.ChannelCost, snapshot.ProfitQuota,
	)
	if err != nil {
		return ErrUnavailable
	}
	if command.RowsAffected() == 1 {
		return nil
	}
	var status string
	err = store.pool.QueryRow(ctx, `SELECT status FROM usage_events WHERE id = $1`, snapshot.UsageEventID).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrUnavailable
	}
	if err != nil {
		return ErrUnavailable
	}
	switch status {
	case "settlement_pending", "settled":
		return nil
	case "reversed", "failed":
		return ErrOperationAlreadyCompleted
	default:
		return ErrOperationInFlight
	}
}

func (store *Store) Settle(ctx context.Context, usageEventID uuid.UUID) (Settlement, error) {
	if store == nil || store.pool == nil || usageEventID == uuid.Nil {
		return Settlement{}, ErrUnavailable
	}
	// Settle is idempotent on terminal states (an already-settled event
	// returns its stored settlement), so re-running a rolled-back attempt is
	// safe by construction.
	var settlement Settlement
	if err := withSerializableRetry(ctx, func() error {
		var attemptErr error
		settlement, attemptErr = store.settleAttempt(ctx, usageEventID)
		return attemptErr
	}); err != nil {
		return Settlement{}, err
	}
	return settlement, nil
}

func (store *Store) settleAttempt(ctx context.Context, usageEventID uuid.UUID) (Settlement, error) {
	tx, err := store.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return Settlement{}, txFailure(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	event, err := loadUsageEvent(ctx, tx, usageEventID)
	if err != nil {
		return Settlement{}, err
	}
	if event.Status == "settled" {
		if event.ActualQuota == nil {
			return Settlement{}, ErrUnavailable
		}
		return Settlement{UsageEventID: event.ID, ActualQuota: *event.ActualQuota, Status: event.Status}, nil
	}
	if event.Status == "reversed" || event.Status == "failed" {
		return Settlement{}, ErrOperationAlreadyCompleted
	}
	if event.Status != "settlement_pending" || event.ActualQuota == nil {
		return Settlement{}, ErrOperationInFlight
	}
	if err := lockUser(ctx, tx, event.UserID); err != nil {
		return Settlement{}, txFailure(err)
	}

	if event.APIKeyBounded {
		if err := canSettleAPIKeyQuota(ctx, tx, event); err != nil {
			return settlePending(ctx, tx, event, err)
		}
	}
	if err := store.canSettleFunding(ctx, tx, event); err != nil {
		return settlePending(ctx, tx, event, err)
	}
	if event.APIKeyBounded {
		if err := applyAPIKeySettlement(ctx, tx, event); err != nil {
			return Settlement{}, err
		}
	}
	if err := store.applyFundingSettlement(ctx, tx, event); err != nil {
		return Settlement{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE usage_events SET status = 'settled', updated_at = now() WHERE id = $1 AND status = 'settlement_pending'`, event.ID); err != nil {
		return Settlement{}, txFailure(err)
	}
	if err := tx.Commit(ctx); err != nil {
		return Settlement{}, txFailure(err)
	}
	return Settlement{UsageEventID: event.ID, ActualQuota: *event.ActualQuota, Status: "settled"}, nil
}

func (store *Store) Reverse(ctx context.Context, usageEventID uuid.UUID) error {
	if store == nil || store.pool == nil || usageEventID == uuid.Nil {
		return ErrUnavailable
	}
	// Reverse is idempotent on an already-reversed event, so a rolled-back
	// attempt can be re-run safely.
	return withSerializableRetry(ctx, func() error {
		return store.reverseAttempt(ctx, usageEventID)
	})
}

func (store *Store) reverseAttempt(ctx context.Context, usageEventID uuid.UUID) error {
	tx, err := store.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return txFailure(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	event, err := loadUsageEvent(ctx, tx, usageEventID)
	if err != nil {
		return err
	}
	if event.Status == "reversed" {
		return nil
	}
	if event.Status == "settled" {
		return ErrOperationAlreadyCompleted
	}
	if event.Status != "reserved" {
		return ErrOperationInFlight
	}
	if err := lockUser(ctx, tx, event.UserID); err != nil {
		return txFailure(err)
	}
	if event.APIKeyBounded {
		if err := releaseAPIKeyHold(ctx, tx, event); err != nil {
			return err
		}
	}
	if err := store.releaseFundingHold(ctx, tx, event); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE usage_events SET status = 'reversed', updated_at = now() WHERE id = $1 AND status = 'reserved'`, event.ID); err != nil {
		return txFailure(err)
	}
	if err := tx.Commit(ctx); err != nil {
		return txFailure(err)
	}
	return nil
}

// RecordRelayAttempt persists one relay attempt's sanitized diagnostics. It
// is a plain insert outside the settlement transaction: attempt bookkeeping
// is audit data, never an input to pricing or funding, and must never block
// or be blocked by the settle/reverse path. It is idempotent on repeated
// calls with the same (usage_event_id, attempt_number) - the table's unique
// index makes a duplicate call for an already-recorded attempt a no-op
// rather than an error, matching this package's existing idempotency style.
func (store *Store) RecordRelayAttempt(ctx context.Context, record RelayAttemptRecord) error {
	if store == nil || store.pool == nil || record.UsageEventID == uuid.Nil || record.AttemptNumber <= 0 ||
		strings.TrimSpace(record.ChannelID) == "" || record.ProviderType < 0 || strings.TrimSpace(record.Status) == "" ||
		record.StartedAt.IsZero() {
		return ErrUnavailable
	}
	_, err := store.pool.Exec(ctx, `
		INSERT INTO gateway_relay_attempts (
			usage_event_id, attempt_number, channel_id, provider_type, status,
			retry_reason, sanitized_error_class, started_at, completed_at
		) VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), NULLIF($7, ''), $8, $9)
		ON CONFLICT (usage_event_id, attempt_number) DO NOTHING`,
		record.UsageEventID, record.AttemptNumber, record.ChannelID, record.ProviderType, record.Status,
		record.RetryReason, record.SanitizedErrorClass, record.StartedAt, record.CompletedAt,
	)
	if err != nil {
		return ErrUnavailable
	}
	return nil
}

func (store *Store) reserveFunding(ctx context.Context, tx pgx.Tx, usageEventID, userID, operationID uuid.UUID, quota int64) (FundingKind, string, error) {
	preference, err := loadFundingPreference(ctx, tx, userID)
	if err != nil {
		return "", "", err
	}
	for _, kind := range fundingOrder(preference) {
		switch kind {
		case FundingSubscription:
			reference, available, reserveErr := reserveSubscription(ctx, tx, usageEventID, userID, operationID, quota)
			if reserveErr != nil {
				return "", "", reserveErr
			}
			if available {
				return FundingSubscription, reference, nil
			}
		case FundingWallet:
			reference, available, reserveErr := reserveWallet(ctx, tx, usageEventID, userID, operationID, quota)
			if reserveErr != nil {
				return "", "", reserveErr
			}
			if available {
				return FundingWallet, reference, nil
			}
		}
	}
	return "", "", ErrInsufficientFunds
}

func reserveAPIKeyQuota(ctx context.Context, tx pgx.Tx, request ReservationRequest, usageEventID uuid.UUID, bounded bool) error {
	if !bounded || request.ReservedQuota == 0 {
		return nil
	}
	spendable, err := apiKeySpendable(ctx, tx, *request.APIKeyID, *request.APIKeyQuotaLimit)
	if err != nil {
		return err
	}
	if spendable < request.ReservedQuota {
		return ErrInsufficientFunds
	}
	return insertAPIKeyLedger(ctx, tx, *request.APIKeyID, usageEventID, "hold", -request.ReservedQuota, operationLedgerKey(request.OperationID, "api-key:hold"), request.OperationID.String())
}

func canSettleAPIKeyQuota(ctx context.Context, tx pgx.Tx, event usageEvent) error {
	if event.APIKeyID == nil || event.ActualQuota == nil {
		return ErrUnavailable
	}
	limit, err := apiKeyQuotaLimit(ctx, tx, *event.APIKeyID)
	if err != nil {
		return err
	}
	spendable, err := apiKeySpendable(ctx, tx, *event.APIKeyID, limit)
	if err != nil {
		return err
	}
	if !canReplaceHold(spendable, event.ReservedQuota, *event.ActualQuota) {
		return ErrInsufficientFunds
	}
	return nil
}

func applyAPIKeySettlement(ctx context.Context, tx pgx.Tx, event usageEvent) error {
	if event.APIKeyID == nil || event.ActualQuota == nil {
		return ErrUnavailable
	}
	if err := releaseAPIKeyHold(ctx, tx, event); err != nil {
		return err
	}
	if *event.ActualQuota == 0 {
		return nil
	}
	return insertAPIKeyLedger(ctx, tx, *event.APIKeyID, event.ID, "debit", -*event.ActualQuota, operationLedgerKey(event.ID, "api-key:debit"), event.ID.String())
}

func releaseAPIKeyHold(ctx context.Context, tx pgx.Tx, event usageEvent) error {
	if event.APIKeyID == nil || event.ReservedQuota == 0 {
		return nil
	}
	return insertAPIKeyLedger(ctx, tx, *event.APIKeyID, event.ID, "release", event.ReservedQuota, operationLedgerKey(event.ID, "api-key:release"), event.ID.String())
}

func (store *Store) canSettleFunding(ctx context.Context, tx pgx.Tx, event usageEvent) error {
	if event.ActualQuota == nil {
		return ErrUnavailable
	}
	switch FundingKind(event.FundingKind) {
	case FundingWallet:
		walletID, err := parseFundingReference(event.FundingRef)
		if err != nil {
			return ErrUnavailable
		}
		balance, err := walletBalance(ctx, tx, walletID)
		if err != nil {
			return err
		}
		if !canReplaceHold(balance, event.ReservedQuota, *event.ActualQuota) {
			return ErrInsufficientFunds
		}
		return nil
	case FundingSubscription:
		state, err := loadSubscriptionState(ctx, tx, event.FundingRef, false)
		if err != nil {
			return err
		}
		if err := resetSubscriptionWindow(ctx, tx, &state, event.ID); err != nil {
			return err
		}
		return subscriptionCanReplaceHold(ctx, tx, state, event.ReservedQuota, *event.ActualQuota)
	default:
		return ErrUnavailable
	}
}

func (store *Store) applyFundingSettlement(ctx context.Context, tx pgx.Tx, event usageEvent) error {
	if event.ActualQuota == nil {
		return ErrUnavailable
	}
	switch FundingKind(event.FundingKind) {
	case FundingWallet:
		walletID, err := parseFundingReference(event.FundingRef)
		if err != nil {
			return ErrUnavailable
		}
		if err := releaseWalletHold(ctx, tx, walletID, event); err != nil {
			return err
		}
		if *event.ActualQuota == 0 {
			return nil
		}
		return insertWalletLedger(ctx, tx, walletID, event.ID, "debit", -*event.ActualQuota, operationLedgerKey(event.ID, "wallet:debit"), event.ID.String())
	case FundingSubscription:
		state, err := loadSubscriptionState(ctx, tx, event.FundingRef, false)
		if err != nil {
			return err
		}
		if err := releaseSubscriptionHold(ctx, tx, state.ID, event); err != nil {
			return err
		}
		if *event.ActualQuota == 0 {
			return nil
		}
		if err := insertSubscriptionLedger(ctx, tx, state.ID, event.ID, "debit", *event.ActualQuota, operationLedgerKey(event.ID, "subscription:debit"), event.ID.String()); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `
			UPDATE subscription_quota_states
			SET window_quota_consumed = window_quota_consumed + $2,
				cumulative_quota_consumed = cumulative_quota_consumed + $2, updated_at = now()
			WHERE subscription_id = $1`, state.ID, *event.ActualQuota)
		if err != nil {
			return txFailure(err)
		}
		return nil
	default:
		return ErrUnavailable
	}
}

func (store *Store) releaseFundingHold(ctx context.Context, tx pgx.Tx, event usageEvent) error {
	switch FundingKind(event.FundingKind) {
	case FundingWallet:
		walletID, err := parseFundingReference(event.FundingRef)
		if err != nil {
			return ErrUnavailable
		}
		return releaseWalletHold(ctx, tx, walletID, event)
	case FundingSubscription:
		state, err := loadSubscriptionState(ctx, tx, event.FundingRef, false)
		if err != nil {
			return err
		}
		return releaseSubscriptionHold(ctx, tx, state.ID, event)
	default:
		return ErrUnavailable
	}
}

func reserveWallet(ctx context.Context, tx pgx.Tx, usageEventID, userID, operationID uuid.UUID, quota int64) (string, bool, error) {
	var walletID uuid.UUID
	err := tx.QueryRow(ctx, `SELECT id FROM wallets WHERE user_id = $1 FOR UPDATE`, userID).Scan(&walletID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, txFailure(err)
	}
	balance, err := walletBalance(ctx, tx, walletID)
	if err != nil {
		return "", false, err
	}
	if balance < quota {
		return "", false, nil
	}
	if quota != 0 {
		if err := insertWalletLedger(ctx, tx, walletID, usageEventID, "hold", -quota, operationLedgerKey(operationID, "wallet:hold"), operationID.String()); err != nil {
			return "", false, err
		}
	}
	return walletID.String(), true, nil
}

func reserveSubscription(ctx context.Context, tx pgx.Tx, usageEventID, userID, operationID uuid.UUID, quota int64) (string, bool, error) {
	state, err := loadActiveSubscriptionState(ctx, tx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	if err := resetSubscriptionWindow(ctx, tx, &state, usageEventID); err != nil {
		return "", false, err
	}
	if err := subscriptionHasQuota(ctx, tx, state, quota); err != nil {
		if errors.Is(err, ErrInsufficientFunds) {
			return "", false, nil
		}
		return "", false, err
	}
	if quota != 0 {
		if err := insertSubscriptionLedger(ctx, tx, state.ID, usageEventID, "hold", quota, operationLedgerKey(operationID, "subscription:hold"), operationID.String()); err != nil {
			return "", false, err
		}
	}
	return state.ID.String(), true, nil
}

func releaseWalletHold(ctx context.Context, tx pgx.Tx, walletID uuid.UUID, event usageEvent) error {
	if event.ReservedQuota == 0 {
		return nil
	}
	return insertWalletLedger(ctx, tx, walletID, event.ID, "release", event.ReservedQuota, operationLedgerKey(event.ID, "wallet:release"), event.ID.String())
}

func releaseSubscriptionHold(ctx context.Context, tx pgx.Tx, subscriptionID uuid.UUID, event usageEvent) error {
	if event.ReservedQuota == 0 {
		return nil
	}
	return insertSubscriptionLedger(ctx, tx, subscriptionID, event.ID, "release", -event.ReservedQuota, operationLedgerKey(event.ID, "subscription:release"), event.ID.String())
}

func loadUsageEvent(ctx context.Context, tx pgx.Tx, id uuid.UUID) (usageEvent, error) {
	var event usageEvent
	var apiKeyID pgtype.UUID
	var actual pgtype.Int8
	err := tx.QueryRow(ctx, `
		SELECT id, user_id, api_key_id, status, funding_kind, funding_reference,
		       reserved_quota, actual_quota,
		       COALESCE((metadata ->> 'api_key_bounded')::boolean, false)
		FROM usage_events WHERE id = $1 FOR UPDATE`, id,
	).Scan(&event.ID, &event.UserID, &apiKeyID, &event.Status, &event.FundingKind, &event.FundingRef, &event.ReservedQuota, &actual, &event.APIKeyBounded)
	if errors.Is(err, pgx.ErrNoRows) {
		return usageEvent{}, ErrUnavailable
	}
	if err != nil {
		return usageEvent{}, txFailure(err)
	}
	if apiKeyID.Valid {
		parsed := uuid.UUID(apiKeyID.Bytes)
		event.APIKeyID = &parsed
	}
	if actual.Valid {
		event.ActualQuota = &actual.Int64
	}
	return event, nil
}

func loadIdempotentOperation(ctx context.Context, tx pgx.Tx, userID uuid.UUID, key string) error {
	var status string
	err := tx.QueryRow(ctx, `SELECT status FROM usage_events WHERE user_id = $1 AND idempotency_key = $2 FOR UPDATE`, userID, key).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return txFailure(err)
	}
	switch status {
	case "settled", "reversed", "failed":
		return ErrOperationAlreadyCompleted
	default:
		return ErrOperationInFlight
	}
}

func lockUser(ctx context.Context, tx pgx.Tx, userID uuid.UUID) error {
	_, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`, userID.String())
	return err
}

func loadFundingPreference(ctx context.Context, tx pgx.Tx, userID uuid.UUID) (string, error) {
	var preference string
	err := tx.QueryRow(ctx, `SELECT funding_preference FROM billing_profiles WHERE user_id = $1`, userID).Scan(&preference)
	if errors.Is(err, pgx.ErrNoRows) {
		return "subscription_first", nil
	}
	if err != nil {
		return "", txFailure(err)
	}
	return preference, nil
}

func fundingOrder(preference string) []FundingKind {
	switch preference {
	case "subscription_first":
		return []FundingKind{FundingSubscription, FundingWallet}
	case "wallet_first":
		return []FundingKind{FundingWallet, FundingSubscription}
	case "subscription_only":
		return []FundingKind{FundingSubscription}
	case "wallet_only":
		return []FundingKind{FundingWallet}
	default:
		return nil
	}
}

func apiKeyQuotaLimit(ctx context.Context, tx pgx.Tx, apiKeyID uuid.UUID) (int64, error) {
	var unlimited bool
	var limit pgtype.Int8
	err := tx.QueryRow(ctx, `SELECT unlimited, quota_limit FROM api_key_billing_policies WHERE api_key_id = $1`, apiKeyID).Scan(&unlimited, &limit)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrUnavailable
	}
	if err != nil {
		return 0, txFailure(err)
	}
	if unlimited || !limit.Valid || limit.Int64 < 0 {
		return 0, ErrUnavailable
	}
	return limit.Int64, nil
}

func apiKeySpendable(ctx context.Context, tx pgx.Tx, apiKeyID uuid.UUID, limit int64) (int64, error) {
	var delta int64
	if err := tx.QueryRow(ctx, `SELECT COALESCE(SUM(quota_delta), 0)::bigint FROM api_key_quota_ledger_entries WHERE api_key_id = $1`, apiKeyID).Scan(&delta); err != nil {
		return 0, txFailure(err)
	}
	if delta > 0 || limit < -delta {
		return 0, ErrUnavailable
	}
	return limit + delta, nil
}

func walletBalance(ctx context.Context, tx pgx.Tx, walletID uuid.UUID) (int64, error) {
	var balance int64
	if err := tx.QueryRow(ctx, `SELECT COALESCE(SUM(amount_microcredits), 0)::bigint FROM wallet_ledger_entries WHERE wallet_id = $1`, walletID).Scan(&balance); err != nil {
		return 0, txFailure(err)
	}
	return balance, nil
}

func loadActiveSubscriptionState(ctx context.Context, tx pgx.Tx, userID uuid.UUID) (subscriptionState, error) {
	var state subscriptionState
	err := tx.QueryRow(ctx, `
		SELECT s.id, q.reset_window_started_at, q.reset_window_ends_at, q.next_reset_at,
		       q.window_quota_limit, q.window_quota_consumed,
		       q.cumulative_quota_limit, q.cumulative_quota_consumed
		FROM subscriptions AS s
		JOIN subscription_quota_states AS q ON q.subscription_id = s.id
		WHERE s.user_id = $1 AND s.status IN ('trialing', 'active')
		  AND (s.current_period_end IS NULL OR s.current_period_end > now())
		ORDER BY s.current_period_end DESC NULLS LAST, s.created_at DESC
		LIMIT 1 FOR UPDATE OF q`, userID,
	).Scan(&state.ID, &state.WindowStartedAt, &state.WindowEndsAt, &state.NextResetAt, &state.WindowQuotaLimit, &state.WindowConsumed, &state.CumulativeLimit, &state.CumulativeConsumed)
	if errors.Is(err, pgx.ErrNoRows) {
		return subscriptionState{}, pgx.ErrNoRows
	}
	if err != nil {
		return subscriptionState{}, txFailure(err)
	}
	return state, nil
}

func loadSubscriptionState(ctx context.Context, tx pgx.Tx, reference string, requireActive bool) (subscriptionState, error) {
	id, err := parseFundingReference(reference)
	if err != nil {
		return subscriptionState{}, ErrUnavailable
	}
	query := `
		SELECT s.id, q.reset_window_started_at, q.reset_window_ends_at, q.next_reset_at,
		       q.window_quota_limit, q.window_quota_consumed,
		       q.cumulative_quota_limit, q.cumulative_quota_consumed
		FROM subscriptions AS s
		JOIN subscription_quota_states AS q ON q.subscription_id = s.id
		WHERE s.id = $1`
	if requireActive {
		query += ` AND s.status IN ('trialing', 'active') AND (s.current_period_end IS NULL OR s.current_period_end > now())`
	}
	query += ` FOR UPDATE OF q`
	var state subscriptionState
	err = tx.QueryRow(ctx, query, id).Scan(&state.ID, &state.WindowStartedAt, &state.WindowEndsAt, &state.NextResetAt, &state.WindowQuotaLimit, &state.WindowConsumed, &state.CumulativeLimit, &state.CumulativeConsumed)
	if errors.Is(err, pgx.ErrNoRows) {
		return subscriptionState{}, ErrInsufficientFunds
	}
	if err != nil {
		return subscriptionState{}, txFailure(err)
	}
	return state, nil
}

func resetSubscriptionWindow(ctx context.Context, tx pgx.Tx, state *subscriptionState, usageEventID uuid.UUID) error {
	if state == nil {
		return ErrUnavailable
	}
	now := time.Now().UTC()
	if now.Before(state.NextResetAt) {
		return nil
	}
	windowDuration := state.WindowEndsAt.Sub(state.WindowStartedAt)
	resetDuration := state.NextResetAt.Sub(state.WindowStartedAt)
	if windowDuration <= 0 || resetDuration <= 0 {
		return ErrUnavailable
	}
	start, next := state.WindowStartedAt, state.NextResetAt
	for !now.Before(next) {
		start = next
		next = next.Add(resetDuration)
	}
	if state.WindowConsumed != 0 {
		key := fmt.Sprintf("subscription-reset:%s:%d", state.ID, start.Unix())
		if err := insertSubscriptionLedger(ctx, tx, state.ID, usageEventID, "reset", -state.WindowConsumed, key, "window_reset"); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, `
		UPDATE subscription_quota_states
		SET reset_window_started_at = $2, reset_window_ends_at = $3, next_reset_at = $4,
			window_quota_consumed = 0, updated_at = now()
		WHERE subscription_id = $1`, state.ID, start, start.Add(windowDuration), next); err != nil {
		return txFailure(err)
	}
	state.WindowStartedAt = start
	state.WindowEndsAt = start.Add(windowDuration)
	state.NextResetAt = next
	state.WindowConsumed = 0
	return nil
}

func subscriptionHasQuota(ctx context.Context, tx pgx.Tx, state subscriptionState, quota int64) error {
	holds, err := activeSubscriptionHolds(ctx, tx, state.ID)
	if err != nil {
		return err
	}
	if !hasSubscriptionCapacity(state, holds, quota) {
		return ErrInsufficientFunds
	}
	return nil
}

func subscriptionCanReplaceHold(ctx context.Context, tx pgx.Tx, state subscriptionState, reserved, actual int64) error {
	holds, err := activeSubscriptionHolds(ctx, tx, state.ID)
	if err != nil {
		return err
	}
	if holds < reserved || !hasSubscriptionCapacity(state, holds-reserved, actual) {
		return ErrInsufficientFunds
	}
	return nil
}

func activeSubscriptionHolds(ctx context.Context, tx pgx.Tx, subscriptionID uuid.UUID) (int64, error) {
	var holds int64
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(SUM(quota_delta) FILTER (WHERE entry_type IN ('hold', 'release')), 0)::bigint
		FROM subscription_quota_ledger_entries WHERE subscription_id = $1`, subscriptionID).Scan(&holds); err != nil {
		return 0, txFailure(err)
	}
	if holds < 0 {
		return 0, ErrUnavailable
	}
	return holds, nil
}

func hasSubscriptionCapacity(state subscriptionState, holds, wanted int64) bool {
	if holds < 0 || wanted < 0 {
		return false
	}
	if state.WindowQuotaLimit.Valid {
		if state.WindowConsumed > state.WindowQuotaLimit.Int64 || holds > state.WindowQuotaLimit.Int64-state.WindowConsumed || wanted > state.WindowQuotaLimit.Int64-state.WindowConsumed-holds {
			return false
		}
	}
	if state.CumulativeLimit.Valid {
		if state.CumulativeConsumed > state.CumulativeLimit.Int64 || holds > state.CumulativeLimit.Int64-state.CumulativeConsumed || wanted > state.CumulativeLimit.Int64-state.CumulativeConsumed-holds {
			return false
		}
	}
	return true
}

func canReplaceHold(balance, reserved, actual int64) bool {
	if reserved < 0 || actual < 0 || balance > 0 && reserved > int64(^uint64(0)>>1)-balance {
		return false
	}
	return actual <= balance+reserved
}

func settlePending(ctx context.Context, tx pgx.Tx, event usageEvent, cause error) (Settlement, error) {
	if !errors.Is(cause, ErrInsufficientFunds) {
		return Settlement{}, cause
	}
	if _, err := tx.Exec(ctx, `UPDATE usage_events SET settlement_attempt_count = settlement_attempt_count + 1, updated_at = now() WHERE id = $1`, event.ID); err != nil {
		return Settlement{}, txFailure(err)
	}
	if err := tx.Commit(ctx); err != nil {
		return Settlement{}, txFailure(err)
	}
	return Settlement{}, ErrInsufficientFunds
}

func reservationMetadata(quote json.RawMessage, apiKeyBounded bool) ([]byte, error) {
	return json.Marshal(struct {
		PricingQuote  json.RawMessage `json:"pricing_quote"`
		APIKeyBounded bool            `json:"api_key_bounded"`
	}{PricingQuote: quote, APIKeyBounded: apiKeyBounded})
}

func parseFundingReference(value string) (uuid.UUID, error) {
	id, err := uuid.Parse(strings.TrimSpace(value))
	if err != nil || id == uuid.Nil {
		return uuid.Nil, ErrUnavailable
	}
	return id, nil
}

func operationLedgerKey(operationID uuid.UUID, suffix string) string {
	return operationID.String() + ":" + suffix
}

func insertAPIKeyLedger(ctx context.Context, tx pgx.Tx, apiKeyID, usageEventID uuid.UUID, entryType string, delta int64, idempotencyKey, reference string) error {
	if delta == 0 {
		return nil
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO api_key_quota_ledger_entries (api_key_id, usage_event_id, entry_type, quota_delta, idempotency_key, reference)
		VALUES ($1, $2, $3, $4, $5, $6)`, apiKeyID, usageEventID, entryType, delta, idempotencyKey, reference)
	if err != nil {
		return txFailure(err)
	}
	return nil
}

func insertWalletLedger(ctx context.Context, tx pgx.Tx, walletID, usageEventID uuid.UUID, entryType string, delta int64, idempotencyKey, reference string) error {
	if delta == 0 {
		return nil
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO wallet_ledger_entries (wallet_id, usage_event_id, entry_type, amount_microcredits, idempotency_key, reference)
		VALUES ($1, $2, $3, $4, $5, $6)`, walletID, usageEventID, entryType, delta, idempotencyKey, reference)
	if err != nil {
		return txFailure(err)
	}
	return nil
}

func insertSubscriptionLedger(ctx context.Context, tx pgx.Tx, subscriptionID, usageEventID uuid.UUID, entryType string, delta int64, idempotencyKey, reference string) error {
	if delta == 0 {
		return nil
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO subscription_quota_ledger_entries (subscription_id, usage_event_id, entry_type, quota_delta, idempotency_key, reference)
		VALUES ($1, $2, $3, $4, $5, $6)`, subscriptionID, usageEventID, entryType, delta, idempotencyKey, reference)
	if err != nil {
		return txFailure(err)
	}
	return nil
}
