package storage

import (
	"strings"
	"testing"
	"time"
)

func TestLocalPutLimit(t *testing.T) {
	l := NewLocal(t.TempDir())
	if n, err := l.Put("a/b.txt", strings.NewReader("hello"), 10); err != nil || n != 5 {
		t.Fatalf("put: n=%d err=%v", n, err)
	}
	if _, err := l.Put("a/c.txt", strings.NewReader("0123456789ABC"), 10); err != ErrTooLarge {
		t.Fatalf("expected ErrTooLarge, got %v", err)
	}
	if _, err := l.Get("a/c.txt"); err == nil {
		t.Fatal("oversized file must be removed")
	}
	if _, err := l.Put("../escape", strings.NewReader("x"), 10); err == nil {
		t.Fatal("path traversal accepted")
	}
}

func TestSigner(t *testing.T) {
	s := NewSigner("k", time.Minute)
	u := s.URL("abc", false)
	var exp, sig string
	for _, p := range strings.Split(strings.SplitN(u, "?", 2)[1], "&") {
		kv := strings.SplitN(p, "=", 2)
		switch kv[0] {
		case "exp":
			exp = kv[1]
		case "sig":
			sig = kv[1]
		}
	}
	if !s.Verify("abc", exp, sig) {
		t.Fatal("valid signature rejected")
	}
	if s.Verify("abd", exp, sig) {
		t.Fatal("signature reused for another id")
	}
	if s.Verify("abc", "1", sig) {
		t.Fatal("expired signature accepted")
	}
}
