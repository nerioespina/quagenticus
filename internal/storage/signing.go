package storage

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strconv"
	"time"
)

// Signer creates short-lived download URLs so <img src> and plain links work
// without an Authorization header.
type Signer struct {
	secret []byte
	ttl    time.Duration
}

func NewSigner(secret string, ttl time.Duration) *Signer {
	return &Signer{secret: []byte("files:" + secret), ttl: ttl}
}

func (s *Signer) sign(id string, exp int64) string {
	mac := hmac.New(sha256.New, s.secret)
	fmt.Fprintf(mac, "%s|%d", id, exp)
	return hex.EncodeToString(mac.Sum(nil))
}

// URL returns the relative signed URL for an attachment.
func (s *Signer) URL(id string, download bool) string {
	exp := time.Now().Add(s.ttl).Unix()
	u := fmt.Sprintf("/api/v1/files/%s?exp=%d&sig=%s", id, exp, s.sign(id, exp))
	if download {
		u += "&dl=1"
	}
	return u
}

// Verify checks signature and expiry.
func (s *Signer) Verify(id, expStr, sig string) bool {
	exp, err := strconv.ParseInt(expStr, 10, 64)
	if err != nil || time.Now().Unix() > exp {
		return false
	}
	return hmac.Equal([]byte(sig), []byte(s.sign(id, exp)))
}
