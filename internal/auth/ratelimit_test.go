package auth

import (
	"testing"
	"time"
)

func TestRateLimiter(t *testing.T) {
	l := NewRateLimiter(2, time.Minute)
	if !l.Allow("k") || !l.Allow("k") {
		t.Fatal("first two hits must pass")
	}
	if l.Allow("k") {
		t.Fatal("third hit must be limited")
	}
	l.Reset("k")
	if !l.Allow("k") {
		t.Fatal("reset must clear the window")
	}
}

func TestParseTokenRejectsOtherAlgorithms(t *testing.T) {
	tok, err := GenerateToken("secret", Actor{Type: "user", ID: "u", AccountID: "a"}, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ParseToken("secret", tok); err != nil {
		t.Fatalf("valid token rejected: %v", err)
	}
	if _, err := ParseToken("other", tok); err == nil {
		t.Fatal("token signed with another key accepted")
	}
	// alg=none token
	none := "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJ1IiwiZXhwIjo5OTk5OTk5OTk5fQ."
	if _, err := ParseToken("secret", none); err == nil {
		t.Fatal("alg=none accepted")
	}
}
