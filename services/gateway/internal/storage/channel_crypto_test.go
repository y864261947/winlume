package storage

import (
	"crypto/rand"
	"testing"

	"github.com/stretchr/testify/require"
)

func testChannelKey(t *testing.T) []byte {
	t.Helper()
	key := make([]byte, 32)
	_, err := rand.Read(key)
	require.NoError(t, err)
	return key
}

func TestChannelCipherEncryptDecryptRoundTrip(t *testing.T) {
	cipher, err := newChannelCipher(testChannelKey(t))
	require.NoError(t, err)

	plaintext := "sk-super-secret-upstream-key"
	ciphertext, err := cipher.Encrypt(plaintext)
	require.NoError(t, err)
	require.NotEqual(t, plaintext, ciphertext)
	require.Contains(t, ciphertext, channelEncryptedPrefix)

	decrypted, err := cipher.Decrypt(ciphertext)
	require.NoError(t, err)
	require.Equal(t, plaintext, decrypted)
}

func TestChannelCipherEncryptIsNonDeterministic(t *testing.T) {
	cipher, err := newChannelCipher(testChannelKey(t))
	require.NoError(t, err)

	first, err := cipher.Encrypt("sk-test")
	require.NoError(t, err)
	second, err := cipher.Encrypt("sk-test")
	require.NoError(t, err)
	require.NotEqual(t, first, second, "each Encrypt call must use a fresh nonce")

	decryptedFirst, err := cipher.Decrypt(first)
	require.NoError(t, err)
	decryptedSecond, err := cipher.Decrypt(second)
	require.NoError(t, err)
	require.Equal(t, "sk-test", decryptedFirst)
	require.Equal(t, "sk-test", decryptedSecond)
}

func TestChannelCipherDecryptPassesThroughPreExistingPlaintext(t *testing.T) {
	// Rows written before encryption-at-rest existed have no
	// channelEncryptedPrefix; Decrypt must return them unchanged instead of
	// erroring, so old rows keep working until they are next re-saved.
	cipher, err := newChannelCipher(testChannelKey(t))
	require.NoError(t, err)

	decrypted, err := cipher.Decrypt("sk-legacy-plaintext-key")
	require.NoError(t, err)
	require.Equal(t, "sk-legacy-plaintext-key", decrypted)
}

func TestChannelCipherNilReceiverIsPassthrough(t *testing.T) {
	var cipher *channelCipher

	encrypted, err := cipher.Encrypt("sk-test")
	require.NoError(t, err)
	require.Equal(t, "sk-test", encrypted)

	decrypted, err := cipher.Decrypt("sk-test")
	require.NoError(t, err)
	require.Equal(t, "sk-test", decrypted)
}

func TestChannelCipherDecryptRejectsTamperedCiphertext(t *testing.T) {
	cipher, err := newChannelCipher(testChannelKey(t))
	require.NoError(t, err)

	ciphertext, err := cipher.Encrypt("sk-test")
	require.NoError(t, err)
	// Flip a bit well inside the encoded payload (not the last character):
	// unpadded base64's final character can carry unused low-order "don't
	// care" bits, so mutating only that character occasionally decodes to
	// the exact same underlying bytes and the tamper goes undetected. A
	// middle byte is always significant.
	payload := []byte(ciphertext)
	encodedStart := len(channelEncryptedPrefix)
	mutateAt := encodedStart + (len(payload)-encodedStart)/2
	payload[mutateAt] = flipBase64URLChar(payload[mutateAt])
	tampered := string(payload)

	_, err = cipher.Decrypt(tampered)
	require.Error(t, err)
}

// flipBase64URLChar returns a different character from the base64 URL
// alphabet than c, so substituting it into an encoded string always changes
// the decoded bytes.
func flipBase64URLChar(c byte) byte {
	if c == 'A' {
		return 'B'
	}
	return 'A'
}

func TestChannelCipherDecryptRejectsDifferentKey(t *testing.T) {
	cipherA, err := newChannelCipher(testChannelKey(t))
	require.NoError(t, err)
	cipherB, err := newChannelCipher(testChannelKey(t))
	require.NoError(t, err)

	ciphertext, err := cipherA.Encrypt("sk-test")
	require.NoError(t, err)

	_, err = cipherB.Decrypt(ciphertext)
	require.Error(t, err)
}

func TestNewChannelCipherRejectsWrongKeyLength(t *testing.T) {
	_, err := newChannelCipher([]byte("too-short"))
	require.Error(t, err)

	_, err = newChannelCipher(nil)
	require.Error(t, err)
}
