//go:build !windows

package httpapi

import "os"

func secureSpillFile(file *os.File) error {
	return file.Chmod(0o600)
}
