package storage

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// Local implements Storage on top of the local filesystem.
type Local struct {
	BasePath string
}

func NewLocal(basePath string) *Local {
	os.MkdirAll(basePath, 0o755) //nolint:errcheck
	return &Local{BasePath: basePath}
}

func (l *Local) path(key string) (string, error) {
	clean := filepath.Clean("/" + key)
	if strings.Contains(key, "..") {
		return "", errors.New("invalid storage key")
	}
	return filepath.Join(l.BasePath, clean), nil
}

func (l *Local) Put(key string, r io.Reader, maxBytes int64) (int64, error) {
	path, err := l.path(key)
	if err != nil {
		return 0, err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return 0, err
	}
	f, err := os.Create(path)
	if err != nil {
		return 0, err
	}
	n, err := io.Copy(f, io.LimitReader(r, maxBytes+1))
	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}
	if err == nil && n > maxBytes {
		err = ErrTooLarge
	}
	if err != nil {
		os.Remove(path) //nolint:errcheck
		return n, err
	}
	return n, nil
}

func (l *Local) Get(key string) (io.ReadCloser, error) {
	path, err := l.path(key)
	if err != nil {
		return nil, err
	}
	return os.Open(path)
}

func (l *Local) Delete(key string) error {
	path, err := l.path(key)
	if err != nil {
		return err
	}
	return os.Remove(path)
}
