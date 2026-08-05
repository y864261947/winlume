package importer

import (
	"context"
	"fmt"
	"strings"
)

// Import builds a sanitized catalog and optionally persists it. The default is
// dry-run: no target connection or mutation is needed until Apply is explicit.
func Import(ctx context.Context, source Source, target Target, options Options) (Report, error) {
	if source == nil {
		return Report{}, fmt.Errorf("%w: source is required", ErrInvalidOptions)
	}
	if strings.TrimSpace(options.SourceLabel) == "" {
		return Report{}, fmt.Errorf("%w: source label is required", ErrInvalidOptions)
	}

	data, err := source.Load(ctx)
	if err != nil {
		return Report{}, err
	}
	catalog, err := Build(data)
	if err != nil {
		return Report{}, err
	}
	catalog.SourceLabel = strings.TrimSpace(options.SourceLabel)
	report := Report{
		DryRun:            !options.Apply,
		SourceHash:        catalog.SourceHash,
		AlgorithmVersion:  catalog.AlgorithmVersion,
		RuleCount:         len(catalog.Rules),
		GroupRuleCount:    len(catalog.GroupRules),
		AvailabilityCount: len(catalog.Availability),
	}
	for _, item := range catalog.Availability {
		if !item.Enabled {
			report.DisabledAvailability++
		}
	}
	if !options.Apply {
		return report, nil
	}
	if target == nil {
		return Report{}, fmt.Errorf("%w: target is required with --apply", ErrInvalidOptions)
	}

	existing, found, err := target.FindByHash(ctx, catalog.SourceHash)
	if err != nil {
		return Report{}, err
	}
	if found {
		report.Noop = true
		report.CatalogID = existing.ID
		report.CatalogState = existing.State
		if options.Activate && existing.State != "active" {
			if err := target.Activate(ctx, existing.ID); err != nil {
				return Report{}, err
			}
			report.Activated = true
			report.CatalogState = "active"
		}
		return report, nil
	}

	id, state, err := target.InsertDraft(ctx, catalog, options.Activate)
	if err != nil {
		return Report{}, err
	}
	report.CatalogID = id
	report.CatalogState = state
	report.Activated = state == "active"
	return report, nil
}
