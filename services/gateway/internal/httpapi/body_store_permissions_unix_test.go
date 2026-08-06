//go:build !windows

package httpapi

import (
	"os"
	"testing"

	"github.com/stretchr/testify/require"
)

func assertOwnerOnlySpillFile(t *testing.T, path string) {
	t.Helper()
	info, err := os.Stat(path)
	require.NoError(t, err)
	require.Equal(t, os.FileMode(0o600), info.Mode().Perm())
}
