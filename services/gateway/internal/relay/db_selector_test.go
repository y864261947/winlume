package relay

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"winlume/services/gateway/internal/storage"
)

// fakeChannelLister is a minimal ChannelLister test double. Each call
// returns the current value of records, and calls is incremented so tests
// can assert on cache hit/miss behavior.
type fakeChannelLister struct {
	records []storage.ChannelRecord
	err     error
	calls   int
}

func (fake *fakeChannelLister) ListChannels(context.Context) ([]storage.ChannelRecord, error) {
	fake.calls++
	if fake.err != nil {
		return nil, fake.err
	}
	return fake.records, nil
}

func newChannelRecord(family string, enabled bool, priority, weight int, baseURL string) storage.ChannelRecord {
	return storage.ChannelRecord{
		ID:             uuid.New(),
		Name:           family + "-channel",
		ProtocolFamily: family,
		BaseURL:        baseURL,
		APIKey:         "secret-key",
		Enabled:        enabled,
		Priority:       priority,
		Weight:         weight,
	}
}

// staticFallbackChannel builds a stub ChannelSelector standing in for the
// static config path, whose identity ("static-fallback") tests can assert
// was actually reached.
func staticFallbackChannel() ChannelSelector {
	return stubSelector{channel: Channel{ID: "static-fallback", Family: "openai"}}
}

type stubSelector struct {
	channel Channel
	err     error
}

func (stub stubSelector) Select(context.Context, Request, AttemptHistory) (Channel, error) {
	if stub.err != nil {
		return Channel{}, stub.err
	}
	return stub.channel, nil
}

func TestDBSelectorUsesEnabledChannelWhenPresent(t *testing.T) {
	lister := &fakeChannelLister{records: []storage.ChannelRecord{
		newChannelRecord("openai", true, 0, 0, "https://db-channel.example.com"),
	}}
	selector := NewDBSelector(lister, staticFallbackChannel(), time.Minute)

	channel, err := selector.Select(context.Background(), Request{Family: "openai"}, nil)
	require.NoError(t, err)
	require.Equal(t, "https://db-channel.example.com", channel.BaseURL.String())
	require.Equal(t, "Bearer secret-key", channel.Authorization)
	require.NotEqual(t, "static-fallback", channel.ID)
}

func TestDBSelectorFallsBackToStaticWhenNoEnabledRowsForFamily(t *testing.T) {
	lister := &fakeChannelLister{records: []storage.ChannelRecord{
		// A row exists, but for a different protocol family.
		newChannelRecord("claude", true, 0, 0, "https://db-claude.example.com"),
	}}
	selector := NewDBSelector(lister, staticFallbackChannel(), time.Minute)

	channel, err := selector.Select(context.Background(), Request{Family: "openai"}, nil)
	require.NoError(t, err)
	require.Equal(t, "static-fallback", channel.ID)
}

func TestDBSelectorFallsBackToStaticWhenTableEmpty(t *testing.T) {
	lister := &fakeChannelLister{records: nil}
	selector := NewDBSelector(lister, staticFallbackChannel(), time.Minute)

	channel, err := selector.Select(context.Background(), Request{Family: "openai"}, nil)
	require.NoError(t, err)
	require.Equal(t, "static-fallback", channel.ID)
}

func TestDBSelectorFallsBackToStaticWhenDatabaseUnreachable(t *testing.T) {
	lister := &fakeChannelLister{err: errors.New("connection refused")}
	selector := NewDBSelector(lister, staticFallbackChannel(), time.Minute)

	channel, err := selector.Select(context.Background(), Request{Family: "openai"}, nil)
	require.NoError(t, err)
	require.Equal(t, "static-fallback", channel.ID)
}

func TestDBSelectorExcludesDisabledChannel(t *testing.T) {
	lister := &fakeChannelLister{records: []storage.ChannelRecord{
		newChannelRecord("openai", false, 10, 10, "https://disabled.example.com"),
	}}
	selector := NewDBSelector(lister, staticFallbackChannel(), time.Minute)

	channel, err := selector.Select(context.Background(), Request{Family: "openai"}, nil)
	require.NoError(t, err)
	require.Equal(t, "static-fallback", channel.ID, "a disabled channel must not be selectable, even alone in its family")
}

func TestDBSelectorPrefersHighestPriorityGroup(t *testing.T) {
	lister := &fakeChannelLister{records: []storage.ChannelRecord{
		newChannelRecord("openai", true, 1, 100, "https://low-priority.example.com"),
		newChannelRecord("openai", true, 5, 1, "https://high-priority.example.com"),
	}}
	selector := NewDBSelector(lister, staticFallbackChannel(), time.Minute)

	// Run several times: with only one high-priority channel, it must always
	// win regardless of weight or the injected random source.
	for i := 0; i < 10; i++ {
		channel, err := selector.Select(context.Background(), Request{Family: "openai"}, nil)
		require.NoError(t, err)
		require.Equal(t, "https://high-priority.example.com", channel.BaseURL.String())
	}
}

func TestDBSelectorWeightedDistributionWithinTopPriorityGroup(t *testing.T) {
	channelA := newChannelRecord("openai", true, 5, 3, "https://a.example.com")
	channelB := newChannelRecord("openai", true, 5, 1, "https://b.example.com")
	lister := &fakeChannelLister{records: []storage.ChannelRecord{channelA, channelB}}
	selector := NewDBSelector(lister, staticFallbackChannel(), time.Minute)

	// Force the deterministic seam: randIntn(totalWeight=4) picking any of
	// 0..2 must land on channel A (cumulative weight 3), and 3 must land on
	// channel B (cumulative weight 4). Sorting inside pickChannelEntry is by
	// UUID string, so figure out which record sorts first to know which
	// index corresponds to which cumulative range.
	first, second := channelA, channelB
	if channelB.ID.String() < channelA.ID.String() {
		first, second = channelB, channelA
	}

	selector.randIntn = func(n int) int {
		require.Equal(t, 4, n)
		return 0
	}
	channel, err := selector.Select(context.Background(), Request{Family: "openai"}, nil)
	require.NoError(t, err)
	require.Equal(t, first.BaseURL, channel.BaseURL.String())

	selector.randIntn = func(n int) int {
		require.Equal(t, 4, n)
		return n - 1
	}
	channel, err = selector.Select(context.Background(), Request{Family: "openai"}, nil)
	require.NoError(t, err)
	require.Equal(t, second.BaseURL, channel.BaseURL.String())
}

func TestDBSelectorZeroWeightGroupPicksUniformly(t *testing.T) {
	lister := &fakeChannelLister{records: []storage.ChannelRecord{
		newChannelRecord("openai", true, 5, 0, "https://a.example.com"),
		newChannelRecord("openai", true, 5, 0, "https://b.example.com"),
	}}
	selector := NewDBSelector(lister, staticFallbackChannel(), time.Minute)
	selector.randIntn = func(n int) int {
		require.Equal(t, 2, n, "an all-zero-weight group must fall back to a uniform pick over its members")
		return 1
	}
	_, err := selector.Select(context.Background(), Request{Family: "openai"}, nil)
	require.NoError(t, err)
}

func TestDBSelectorCachesBetweenCallsWithinTTL(t *testing.T) {
	lister := &fakeChannelLister{records: []storage.ChannelRecord{
		newChannelRecord("openai", true, 0, 0, "https://db-channel.example.com"),
	}}
	selector := NewDBSelector(lister, staticFallbackChannel(), time.Minute)

	fakeNow := time.Now()
	selector.now = func() time.Time { return fakeNow }

	_, err := selector.Select(context.Background(), Request{Family: "openai"}, nil)
	require.NoError(t, err)
	_, err = selector.Select(context.Background(), Request{Family: "openai"}, nil)
	require.NoError(t, err)
	require.Equal(t, 1, lister.calls, "a second Select within the TTL must not re-query the store")

	fakeNow = fakeNow.Add(2 * time.Minute)
	_, err = selector.Select(context.Background(), Request{Family: "openai"}, nil)
	require.NoError(t, err)
	require.Equal(t, 2, lister.calls, "a Select after the TTL has elapsed must refresh from the store")
}

func TestDBSelectorSkipsRowWithUnparsableBaseURL(t *testing.T) {
	lister := &fakeChannelLister{records: []storage.ChannelRecord{
		newChannelRecord("openai", true, 0, 0, "not-a-valid-url"),
	}}
	selector := NewDBSelector(lister, staticFallbackChannel(), time.Minute)

	channel, err := selector.Select(context.Background(), Request{Family: "openai"}, nil)
	require.NoError(t, err)
	require.Equal(t, "static-fallback", channel.ID, "a malformed base_url row must not break routing for the rest of the family")
}

func TestDBSelectorNilFallbackReturnsErrNoChannelWhenNoRows(t *testing.T) {
	lister := &fakeChannelLister{records: nil}
	selector := NewDBSelector(lister, nil, time.Minute)

	_, err := selector.Select(context.Background(), Request{Family: "openai"}, nil)
	require.ErrorIs(t, err, ErrNoChannel)
}
