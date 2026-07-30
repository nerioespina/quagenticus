package storage

import (
	"io"
	"os"
	"path/filepath"
)

// Local implements Storage on top of the local filesystem.
type Local struct {
	BasePath string
}

func NewLocal(basePath string) *Local {
	os.MkdirAll(basePath, 0755) //nolint:errcheck
	return &Local{BasePath: basePath}
}

func (l *Local) Put(key string, r io.Reader, _ string) error {
	path := filepath.Join(l.BasePath, key)
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, r)
	return err
}

func (l *Local) Get(key string) (io.ReadCloser, error) {
	return os.Open(filepath.Join(l.BasePath, key))
}

func (l *Local) Delete(key string) error {
	return os.Remove(filepath.Join(l.BasePath, key))
}

// URL is unused for the fs backend — downloads are proxied through the
// existing /attachments/:id/download route. A future remote backend
// (e.g. S3) would return a signed URL here instead.
func (l *Local) URL(_ string) string {
	return ""
}
