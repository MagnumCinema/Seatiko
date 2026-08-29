package qr

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"strings"
)

const defaultSecret = "foodassistant-qr-dev-secret"

// Sign builds a stable HMAC token for a venue table.
func Sign(secret, venueID, tableID string) string {
	if strings.TrimSpace(secret) == "" {
		secret = defaultSecret
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(venueID + ":" + tableID))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// Verify checks an HMAC token for a venue table.
func Verify(secret, venueID, tableID, token string) bool {
	expected := Sign(secret, venueID, tableID)
	return hmac.Equal([]byte(expected), []byte(strings.TrimSpace(token)))
}

// LegacyToken is the simple venueId:tableId format accepted for compatibility.
func LegacyToken(venueID, tableID string) string {
	return venueID + ":" + tableID
}

// RandomToken returns a unique opaque token suitable for storage on a table.
func RandomToken() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("qr token: %w", err)
	}
	return hex.EncodeToString(buf), nil
}
