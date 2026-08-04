//go:build windows

package httpapi

import (
	"os"
	"testing"
	"unsafe"

	"github.com/stretchr/testify/require"
	"golang.org/x/sys/windows"
)

func assertOwnerOnlySpillFile(t *testing.T, path string) {
	t.Helper()
	_, err := os.ReadFile(path)
	require.NoError(t, err, "current user must be able to read its spill file")

	currentUser, err := windows.GetCurrentProcessToken().GetTokenUser()
	require.NoError(t, err)
	descriptor, err := windows.GetNamedSecurityInfo(path, windows.SE_FILE_OBJECT,
		windows.OWNER_SECURITY_INFORMATION|windows.DACL_SECURITY_INFORMATION|windows.PROTECTED_DACL_SECURITY_INFORMATION)
	require.NoError(t, err)

	owner, _, err := descriptor.Owner()
	require.NoError(t, err)
	require.True(t, owner.Equals(currentUser.User.Sid), "spill file owner must be the current user")

	control, _, err := descriptor.Control()
	require.NoError(t, err)
	require.NotZero(t, control&windows.SE_DACL_PROTECTED, "spill file must not inherit directory permissions")

	dacl, _, err := descriptor.DACL()
	require.NoError(t, err)
	require.NotNil(t, dacl)
	require.Equal(t, uint16(1), dacl.AceCount, "only the owner may receive an explicit allow ACE")

	everyone, err := windows.CreateWellKnownSid(windows.WinWorldSid)
	require.NoError(t, err)
	users, err := windows.CreateWellKnownSid(windows.WinBuiltinUsersSid)
	require.NoError(t, err)

	for index := uint16(0); index < dacl.AceCount; index++ {
		ace := new(windows.ACCESS_ALLOWED_ACE)
		require.NoError(t, windows.GetAce(dacl, uint32(index), &ace))
		require.Equal(t, uint8(windows.ACCESS_ALLOWED_ACE_TYPE), ace.Header.AceType)
		principal := (*windows.SID)(unsafe.Pointer(&ace.SidStart))
		require.False(t, principal.Equals(everyone), "Everyone must not receive spill-file access")
		require.False(t, principal.Equals(users), "Builtin Users must not receive spill-file access")
		require.True(t, principal.Equals(currentUser.User.Sid), "only the current user may receive spill-file access")
		// Windows maps GENERIC_ALL to FILE_ALL_ACCESS when persisting the ACE.
		require.Equal(t, windows.ACCESS_MASK(windows.STANDARD_RIGHTS_REQUIRED|windows.SYNCHRONIZE|0x1FF), ace.Mask)
	}
}
