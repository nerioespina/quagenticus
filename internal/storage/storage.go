package storage

import "io"

// Storage abstracts where attachment file bytes are persisted, so handlers
// don't depend on the local filesystem directly.
type Storage interface {
	Put(key string, r io.Reader, contentType string) error
	Get(key string) (io.ReadCloser, error)
	Delete(key string) error
	URL(key string) string
}
