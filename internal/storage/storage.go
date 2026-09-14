package storage

import (
	"errors"
	"io"
)

// ErrTooLarge is returned by Put when the stream exceeds the allowed size.
var ErrTooLarge = errors.New("file too large")

// Storage abstracts where attachment file bytes are persisted, so handlers
// don't depend on the local filesystem directly.
type Storage interface {
	// Put stores at most maxBytes from r and returns the bytes written.
	Put(key string, r io.Reader, maxBytes int64) (int64, error)
	Get(key string) (io.ReadCloser, error)
	Delete(key string) error
}
