// Command create-service-account is the one-time, operator-run tool that
// provisions a new internal-application identity: a users row flagged
// is_service_account, one api_keys row, a default billing policy, and a
// wallet row. The plaintext key is printed exactly once — it is never
// stored. See
// docs/superpowers/specs/2026-08-06-gateway-service-accounts-design.md.
package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"reizo/services/gateway/internal/identity"
)

func main() {
	os.Exit(execute(context.Background(), os.Args[1:], os.Getenv, os.Stdout, os.Stderr))
}

const keyPrefix = "wl_"

func generateKey() (plaintext, prefix, hash string, err error) {
	secretBytes := make([]byte, 32)
	if _, err = rand.Read(secretBytes); err != nil {
		return "", "", "", err
	}
	secret := base64.RawURLEncoding.EncodeToString(secretBytes)
	plaintext = keyPrefix + secret
	prefix = keyPrefix + secret[:6]
	return plaintext, prefix, identity.HashAPIKey(plaintext), nil
}

func execute(ctx context.Context, arguments []string, getenv func(string) string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("create-service-account", flag.ContinueOnError)
	flags.SetOutput(stderr)
	var username, displayName, billingGroup string
	flags.StringVar(&username, "username", "", "required unique username, e.g. svc-reizo-app")
	flags.StringVar(&displayName, "display-name", "", "required human-readable name, e.g. \"Reizo App\"")
	flags.StringVar(&billingGroup, "billing-group", "default", "billing group for pricing/accounting separation")
	if err := flags.Parse(arguments); err != nil {
		return 2
	}
	username = strings.TrimSpace(username)
	displayName = strings.TrimSpace(displayName)
	if username == "" || displayName == "" {
		_, _ = fmt.Fprintln(stderr, "create-service-account requires --username and --display-name")
		return 2
	}

	pool, err := pgxpool.New(ctx, getenv("DATABASE_URL"))
	if err != nil {
		_, _ = fmt.Fprintln(stderr, "create-service-account could not connect to the database")
		return 1
	}
	defer pool.Close()

	var existing int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM users WHERE username = $1`, username).Scan(&existing); err != nil {
		_, _ = fmt.Fprintln(stderr, "create-service-account could not check for an existing username")
		return 1
	}
	if existing > 0 {
		_, _ = fmt.Fprintf(stderr, "create-service-account: username %q already exists\n", username)
		return 1
	}

	plaintext, prefix, hash, err := generateKey()
	if err != nil {
		_, _ = fmt.Fprintln(stderr, "create-service-account could not generate a key")
		return 1
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		_, _ = fmt.Fprintln(stderr, "create-service-account could not start a transaction")
		return 1
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var userID, apiKeyID string
	if err := tx.QueryRow(ctx, `
		INSERT INTO users (username, display_name, is_service_account, status)
		VALUES ($1, $2, true, 'active') RETURNING id`, username, displayName).Scan(&userID); err != nil {
		_, _ = fmt.Fprintln(stderr, "create-service-account could not insert the service-account user")
		return 1
	}
	if err := tx.QueryRow(ctx, `
		INSERT INTO api_keys (user_id, name, key_prefix, key_hash)
		VALUES ($1, $2, $3, $4) RETURNING id`, userID, displayName+" service key", prefix, hash).Scan(&apiKeyID); err != nil {
		_, _ = fmt.Fprintln(stderr, "create-service-account could not insert the API key")
		return 1
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO api_key_billing_policies (api_key_id, billing_group, unlimited, quota_limit)
		VALUES ($1, $2, false, 0)`, apiKeyID, billingGroup); err != nil {
		_, _ = fmt.Fprintln(stderr, "create-service-account could not insert the billing policy")
		return 1
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO wallets (user_id) VALUES ($1)`, userID); err != nil {
		_, _ = fmt.Fprintln(stderr, "create-service-account could not insert the wallet")
		return 1
	}
	if err := tx.Commit(ctx); err != nil {
		_, _ = fmt.Fprintln(stderr, "create-service-account could not commit the transaction")
		return 1
	}

	_, _ = fmt.Fprintf(stdout, "created service account %q (user_id=%s api_key_id=%s)\n", username, userID, apiKeyID)
	_, _ = fmt.Fprintf(stdout, "plaintext key (shown once, store it now): %s\n", plaintext)
	_, _ = fmt.Fprintln(stdout, "quota_limit was set to 0 — raise it from /gateway-admin before the app sends real traffic.")
	return 0
}
