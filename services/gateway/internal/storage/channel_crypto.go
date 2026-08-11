package storage

// channel_crypto.go implements encryption-at-rest for the channels.api_key
// column using stdlib AES-256-GCM only (crypto/aes + crypto/cipher) - no new
// dependency. The key comes from config.Config.ChannelEncryptionKey, decoded
// from REIZO_CHANNEL_ENCRYPTION_KEY by services/gateway/internal/config;
// this file only consumes the already-decoded 32-byte key.
//
// Migration note for rows written before this change: channelCipher.Decrypt
// recognizes ciphertext it produced by a leading channelEncryptedPrefix and
// passes through any value without that prefix unchanged. That means
// pre-existing plaintext api_key rows keep decrypting correctly (as
// themselves) after this deploy, and are transparently upgraded to
// ciphertext the next time each row is written (CreateChannel always writes
// ciphertext; UpdateChannel re-encrypts whenever api_key is included in the
// patch). Per the task this table is expected to be empty or near-empty in
// production; if it is not, a low-effort way to force the upgrade for every
// row is a one-time re-save of each channel's existing api_key value through
// PATCH /internal/admin/channels/{id} after deploying this change.
import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"strings"
)

// channelEncryptedPrefix tags a channels.api_key value as AES-256-GCM
// ciphertext produced by this package (schema version 1), distinguishing it
// from a pre-existing plaintext row from before encryption-at-rest existed.
const channelEncryptedPrefix = "wlce1:"

// errChannelCiphertextMalformed is returned by Decrypt when a value carries
// channelEncryptedPrefix but is not valid ciphertext produced by Encrypt.
var errChannelCiphertextMalformed = errors.New("channel api_key ciphertext is malformed")

// channelCipher encrypts and decrypts the channels.api_key column at the
// storage boundary. A nil *channelCipher is a valid, inert value: Encrypt and
// Decrypt both become no-ops. Store never actually runs with a nil cipher in
// production (newStoreWithPool below requires a real key), but tests in this
// package that build &Store{pool: pool} directly - without threading a key
// through - keep working unencrypted rather than panicking.
type channelCipher struct {
	aead cipher.AEAD
}

// newChannelCipher builds a channelCipher from a decoded AES-256 key. key
// must be exactly 32 bytes; see config.ChannelEncryptionKeySize.
func newChannelCipher(key []byte) (*channelCipher, error) {
	if len(key) != 32 {
		return nil, fmt.Errorf("channel encryption key must be 32 bytes, got %d", len(key))
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("build AES cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("build AES-GCM: %w", err)
	}
	return &channelCipher{aead: gcm}, nil
}

// Encrypt returns a channelEncryptedPrefix-tagged, base64-encoded ciphertext
// for plaintext, using a fresh random nonce every call. A nil receiver
// returns plaintext unchanged.
func (c *channelCipher) Encrypt(plaintext string) (string, error) {
	if c == nil {
		return plaintext, nil
	}
	nonce := make([]byte, c.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("generate nonce: %w", err)
	}
	sealed := c.aead.Seal(nonce, nonce, []byte(plaintext), nil)
	return channelEncryptedPrefix + base64.RawURLEncoding.EncodeToString(sealed), nil
}

// Decrypt reverses Encrypt. A value without channelEncryptedPrefix is
// returned unchanged (see the migration note above); a nil receiver likewise
// passes everything through unchanged.
func (c *channelCipher) Decrypt(stored string) (string, error) {
	if c == nil || !strings.HasPrefix(stored, channelEncryptedPrefix) {
		return stored, nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(stored, channelEncryptedPrefix))
	if err != nil {
		return "", fmt.Errorf("%w: %v", errChannelCiphertextMalformed, err)
	}
	nonceSize := c.aead.NonceSize()
	if len(raw) < nonceSize {
		return "", fmt.Errorf("%w: too short", errChannelCiphertextMalformed)
	}
	nonce, ciphertext := raw[:nonceSize], raw[nonceSize:]
	plaintext, err := c.aead.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("%w: %v", errChannelCiphertextMalformed, err)
	}
	return string(plaintext), nil
}
