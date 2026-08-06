package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	"winlume/services/gateway/internal/importer"
)

func main() {
	os.Exit(execute(context.Background(), os.Args[1:], os.Getenv, os.Stdout, os.Stderr))
}

func execute(ctx context.Context, arguments []string, getenv func(string) string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("pricing-import", flag.ContinueOnError)
	flags.SetOutput(stderr)
	var sourceLabel string
	var apply bool
	var activate bool
	flags.StringVar(&sourceLabel, "source-label", "", "required source instance label")
	flags.BoolVar(&apply, "apply", false, "write the validated catalog to WinLume")
	flags.BoolVar(&activate, "activate", false, "activate the imported catalog (requires --apply)")
	if err := flags.Parse(arguments); err != nil {
		return 2
	}
	if strings.TrimSpace(sourceLabel) == "" {
		_, _ = fmt.Fprintln(stderr, "pricing import requires --source-label")
		return 2
	}
	if activate && !apply {
		_, _ = fmt.Fprintln(stderr, "pricing import --activate requires --apply")
		return 2
	}

	source, err := importer.NewPostgresSource(ctx, getenv("NEW_API_DATABASE_URL"))
	if err != nil {
		_, _ = fmt.Fprintln(stderr, "pricing import could not connect to the new-api source")
		return 1
	}
	defer source.Close()

	var target *importer.PostgresTarget
	if apply {
		target, err = importer.NewPostgresTarget(ctx, getenv("DATABASE_URL"))
		if err != nil {
			_, _ = fmt.Fprintln(stderr, "pricing import could not connect to the WinLume target")
			return 1
		}
		defer target.Close()
	}
	report, err := importer.Import(ctx, source, target, importer.Options{
		SourceLabel: sourceLabel,
		Apply:       apply,
		Activate:    activate,
	})
	if err != nil {
		_, _ = fmt.Fprintln(stderr, "pricing import failed")
		return 1
	}
	_, _ = fmt.Fprintf(stdout,
		"pricing import: dry_run=%t noop=%t activated=%t state=%s rules=%d groups=%d availability=%d disabled=%d algorithm=%s hash=%s\n",
		report.DryRun, report.Noop, report.Activated, report.CatalogState, report.RuleCount,
		report.GroupRuleCount, report.AvailabilityCount, report.DisabledAvailability,
		report.AlgorithmVersion, report.SourceHash,
	)
	return 0
}
