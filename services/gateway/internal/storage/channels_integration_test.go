//go:build integration

package storage

// Real-PostgreSQL integration tests for channels.go, run against the same
// throwaway schema and migrations as billing_integration_test.go so the
// channels_name_unique index from drizzle/0005_adorable_venus.sql is
// exercised for real.
//
// Run with:
//
//	go -C services/gateway test -tags=integration ./internal/storage -v -run Channel

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func strPtr(value string) *string { return &value }
func intPtr(value int) *int       { return &value }
func boolPtr(value bool) *bool    { return &value }

func TestChannelCreateListUpdateDeleteRoundTrip(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()

	name := uuid.New().String()
	created, err := store.CreateChannel(ctx, ChannelInput{
		Name:           strPtr(name),
		ProtocolFamily: strPtr("openai"),
		BaseURL:        strPtr("https://api.openai.example/v1"),
		APIKey:         strPtr("sk-test-key"),
	})
	require.NoError(t, err)
	require.Equal(t, name, created.Name)
	require.Equal(t, "openai", created.ProtocolFamily)
	require.True(t, created.Enabled)
	require.Equal(t, 0, created.Priority)
	require.Equal(t, 0, created.Weight)
	require.Equal(t, "sk-test-key", created.APIKey)

	list, err := store.ListChannels(ctx)
	require.NoError(t, err)
	found := false
	for _, record := range list {
		if record.ID == created.ID {
			found = true
			require.Equal(t, name, record.Name)
		}
	}
	require.True(t, found)

	updated, err := store.UpdateChannel(ctx, created.ID, ChannelInput{
		BaseURL:  strPtr("https://api.openai.example/v2"),
		Priority: intPtr(5),
		Weight:   intPtr(10),
		Enabled:  boolPtr(false),
	})
	require.NoError(t, err)
	require.Equal(t, "https://api.openai.example/v2", updated.BaseURL)
	require.Equal(t, 5, updated.Priority)
	require.Equal(t, 10, updated.Weight)
	require.False(t, updated.Enabled)
	// Fields not included in the patch are left untouched.
	require.Equal(t, name, updated.Name)
	require.Equal(t, "sk-test-key", updated.APIKey)

	require.NoError(t, store.DeleteChannel(ctx, created.ID))
	require.ErrorIs(t, store.DeleteChannel(ctx, created.ID), ErrChannelNotFound)

	_, err = store.UpdateChannel(ctx, uuid.New(), ChannelInput{Name: strPtr("nope")})
	require.ErrorIs(t, err, ErrChannelNotFound)
}

func TestChannelCreateRejectsUnknownProtocolFamily(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()

	_, err := store.CreateChannel(ctx, ChannelInput{
		Name:           strPtr(uuid.New().String()),
		ProtocolFamily: strPtr("not-a-real-protocol"),
		BaseURL:        strPtr("https://example.test"),
		APIKey:         strPtr("sk-test"),
	})
	require.ErrorIs(t, err, ErrInvalidChannelInput)
}

func TestChannelCreateRejectsDuplicateName(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	name := uuid.New().String()

	_, err := store.CreateChannel(ctx, ChannelInput{
		Name: strPtr(name), ProtocolFamily: strPtr("claude"),
		BaseURL: strPtr("https://a.example"), APIKey: strPtr("sk-a"),
	})
	require.NoError(t, err)

	_, err = store.CreateChannel(ctx, ChannelInput{
		Name: strPtr(name), ProtocolFamily: strPtr("claude"),
		BaseURL: strPtr("https://b.example"), APIKey: strPtr("sk-b"),
	})
	require.ErrorIs(t, err, ErrInvalidChannelInput)
}

func TestChannelCreateRejectsMissingRequiredFields(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()

	_, err := store.CreateChannel(ctx, ChannelInput{
		ProtocolFamily: strPtr("openai"),
		BaseURL:        strPtr("https://example.test"),
		APIKey:         strPtr("sk-test"),
	})
	require.ErrorIs(t, err, ErrInvalidChannelInput)

	_, err = store.CreateChannel(ctx, ChannelInput{
		Name:           strPtr(uuid.New().String()),
		ProtocolFamily: strPtr("openai"),
		BaseURL:        strPtr("https://example.test"),
		APIKey:         strPtr(""),
	})
	require.ErrorIs(t, err, ErrInvalidChannelInput)
}

func TestChannelUpdateRejectsNegativePriorityOrWeight(t *testing.T) {
	store := billingTestStore(t)
	ctx := context.Background()
	created, err := store.CreateChannel(ctx, ChannelInput{
		Name: strPtr(uuid.New().String()), ProtocolFamily: strPtr("gemini"),
		BaseURL: strPtr("https://example.test"), APIKey: strPtr("sk-test"),
	})
	require.NoError(t, err)

	_, err = store.UpdateChannel(ctx, created.ID, ChannelInput{Priority: intPtr(-1)})
	require.ErrorIs(t, err, ErrInvalidChannelInput)

	_, err = store.UpdateChannel(ctx, created.ID, ChannelInput{Weight: intPtr(-1)})
	require.ErrorIs(t, err, ErrInvalidChannelInput)
}
