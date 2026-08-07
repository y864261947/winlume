package relay

import (
	"context"
	"math/rand"
	"net/http"
	"net/url"
	"sort"
	"sync"
	"time"

	"winlume/services/gateway/internal/storage"
)

// ChannelLister is the storage surface DBSelector depends on. It is
// satisfied by *storage.Store in production and a fake in tests.
type ChannelLister interface {
	ListChannels(ctx context.Context) ([]storage.ChannelRecord, error)
}

// defaultChannelCacheTTL bounds how stale the in-memory channel cache can be
// before DBSelector re-queries the channels table. It mirrors the "short
// TTL, refreshed lazily on the next request past expiry" shape used
// elsewhere in this codebase for infrequently-changing config (e.g. the
// pricing catalog is loaded fresh per quote; channels change far less often
// than a quote is requested, so a short cache avoids hitting Postgres on
// every relay).
const defaultChannelCacheTTL = 30 * time.Second

// channelEntry is one enabled channels-table row, pre-parsed into the shape
// Select needs. Rows with an unparsable base_url are dropped during refresh
// rather than surfaced at selection time, so a single malformed admin-entered
// row cannot take down routing for the rest of its protocol family.
type channelEntry struct {
	id       string
	family   string
	baseURL  *url.URL
	apiKey   string
	priority int
	weight   int
}

// DBSelector selects a live relay Channel from the admin-managed `channels`
// table, grouping enabled rows by protocol_family and preferring the
// highest-priority group, then weighted-randomly among ties within that
// group (matching the priority/weight semantics documented on
// ChannelsTable.tsx: priority selects the preferred group, weight
// distributes load within it).
//
// If the channels table has zero enabled rows for a requested
// protocol_family (including when the table is completely empty, or the
// database is unreachable), Select falls back to fallback.Select - normally
// a *StaticSelector sourced from env/yaml. This is a hard safety
// requirement: routing for a protocol family with no admin-managed channels
// configured must keep working exactly as it did before this selector
// existed.
type DBSelector struct {
	store    ChannelLister
	fallback ChannelSelector
	ttl      time.Duration

	// now and randIntn are seams for deterministic tests; production code
	// leaves them nil and NewDBSelector installs the real implementations.
	now      func() time.Time
	randIntn func(int) int

	mu       sync.Mutex
	expiry   time.Time
	byFamily map[string][]channelEntry
}

// NewDBSelector builds a DBSelector. ttl <= 0 uses defaultChannelCacheTTL.
// fallback must not be nil - it is the entire safety net for protocol
// families with no channels rows, so a nil fallback is refused rather than
// silently degrading to ErrNoChannel for those families.
func NewDBSelector(store ChannelLister, fallback ChannelSelector, ttl time.Duration) *DBSelector {
	if ttl <= 0 {
		ttl = defaultChannelCacheTTL
	}
	return &DBSelector{
		store:    store,
		fallback: fallback,
		ttl:      ttl,
		now:      time.Now,
		randIntn: rand.Intn,
	}
}

// Select implements ChannelSelector.
func (selector *DBSelector) Select(ctx context.Context, request Request, history AttemptHistory) (Channel, error) {
	if selector == nil {
		return Channel{}, ErrNoChannel
	}
	entries := selector.enabledChannels(ctx, request.Family)
	if len(entries) == 0 {
		return selector.selectFallback(ctx, request, history)
	}
	chosen := pickChannelEntry(entries, selector.randIntn)
	return channelFromEntry(chosen), nil
}

func (selector *DBSelector) selectFallback(ctx context.Context, request Request, history AttemptHistory) (Channel, error) {
	if selector.fallback == nil {
		return Channel{}, ErrNoChannel
	}
	return selector.fallback.Select(ctx, request, history)
}

// enabledChannels returns the cached, enabled channelEntry rows for family,
// refreshing the cache first if it has expired. Any refresh error (including
// an unreachable database) is swallowed here: the caller only ever sees an
// empty slice, which routes it to the static fallback rather than failing
// the request outright.
func (selector *DBSelector) enabledChannels(ctx context.Context, family string) []channelEntry {
	selector.mu.Lock()
	defer selector.mu.Unlock()

	if selector.byFamily == nil || selector.now().After(selector.expiry) {
		if byFamily, err := selector.load(ctx); err == nil {
			selector.byFamily = byFamily
			selector.expiry = selector.now().Add(selector.ttl)
		} else {
			// Refresh failed (e.g. database unreachable). Push the expiry
			// forward regardless, so a sustained outage retries once per TTL
			// instead of hitting Postgres on every single request. If a
			// prior successful load exists, keep serving that stale-but-DB-
			// sourced cache rather than reverting live traffic to static
			// config just because one refresh hiccuped; otherwise leave
			// byFamily nil so every family falls back to static config
			// until a load succeeds.
			selector.expiry = selector.now().Add(selector.ttl)
			if selector.byFamily == nil {
				return nil
			}
		}
	}
	return selector.byFamily[family]
}

func (selector *DBSelector) load(ctx context.Context) (map[string][]channelEntry, error) {
	if selector.store == nil {
		return nil, ErrNoChannel
	}
	records, err := selector.store.ListChannels(ctx)
	if err != nil {
		return nil, err
	}
	byFamily := make(map[string][]channelEntry)
	for _, record := range records {
		if !record.Enabled {
			continue
		}
		baseURL, parseErr := url.Parse(record.BaseURL)
		if parseErr != nil || baseURL.Scheme == "" || baseURL.Host == "" {
			continue
		}
		byFamily[record.ProtocolFamily] = append(byFamily[record.ProtocolFamily], channelEntry{
			id:       record.ID.String(),
			family:   record.ProtocolFamily,
			baseURL:  baseURL,
			apiKey:   record.APIKey,
			priority: record.Priority,
			weight:   record.Weight,
		})
	}
	return byFamily, nil
}

// pickChannelEntry selects one entry from the highest-priority group present
// in entries (higher Priority value wins the group), then a weighted-random
// pick within that group by Weight. Entries with non-positive weight are
// included with zero probability unless every entry in the group is
// non-positive, in which case the group is picked uniformly at random.
func pickChannelEntry(entries []channelEntry, randIntn func(int) int) channelEntry {
	if len(entries) == 1 {
		return entries[0]
	}

	topPriority := entries[0].priority
	for _, entry := range entries[1:] {
		if entry.priority > topPriority {
			topPriority = entry.priority
		}
	}
	group := make([]channelEntry, 0, len(entries))
	for _, entry := range entries {
		if entry.priority == topPriority {
			group = append(group, entry)
		}
	}
	// Sort for deterministic iteration order (map-sourced input has none);
	// this only affects which entry wins a tie in totalWeight == 0 mode.
	sort.Slice(group, func(i, j int) bool { return group[i].id < group[j].id })
	if len(group) == 1 {
		return group[0]
	}

	totalWeight := 0
	for _, entry := range group {
		if entry.weight > 0 {
			totalWeight += entry.weight
		}
	}
	if randIntn == nil {
		randIntn = rand.Intn
	}
	if totalWeight <= 0 {
		return group[randIntn(len(group))]
	}
	target := randIntn(totalWeight)
	cumulative := 0
	for _, entry := range group {
		if entry.weight <= 0 {
			continue
		}
		cumulative += entry.weight
		if target < cumulative {
			return entry
		}
	}
	return group[len(group)-1]
}

func channelFromEntry(entry channelEntry) Channel {
	return Channel{
		ID:            entry.id,
		Family:        entry.family,
		BaseURL:       cloneURL(entry.baseURL),
		Authorization: normalizeAuthorization(entry.apiKey),
		Headers:       make(http.Header),
	}
}
