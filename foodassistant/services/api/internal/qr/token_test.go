package qr

import "testing"

func TestSignAndVerify(t *testing.T) {
	token := Sign("secret", "venue-1", "table-1")
	if token == "" {
		t.Fatal("empty token")
	}
	if !Verify("secret", "venue-1", "table-1", token) {
		t.Fatal("verify failed for valid token")
	}
	if Verify("secret", "venue-1", "table-2", token) {
		t.Fatal("verify should fail for different table")
	}
	if LegacyToken("a", "b") != "a:b" {
		t.Fatal("legacy token mismatch")
	}
	random, err := RandomToken()
	if err != nil || random == "" {
		t.Fatalf("random token = %q, %v", random, err)
	}
}
