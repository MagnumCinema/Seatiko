// Package media stores user-uploaded files (avatars): S3-compatible object storage
// (AWS S3, Cloudflare R2, MinIO) when configured, else a local directory served by the API.
package media

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Store keeps files under keys like "avatars/<user>/<id>.jpg".
type Store interface {
	// Put stores data and returns its public URL.
	Put(ctx context.Context, key, contentType string, data []byte) (string, error)
	Delete(ctx context.Context, key string) error
}

// Local writes files to Dir; they are served at URLPrefix (e.g. "/uploads").
type Local struct {
	Dir       string
	URLPrefix string
}

func validKey(key string) error {
	if key == "" || strings.HasPrefix(key, "/") || strings.Contains(key, "..") || strings.Contains(key, "\\") {
		return fmt.Errorf("invalid media key %q", key)
	}
	return nil
}

func (l Local) Put(_ context.Context, key, _ string, data []byte) (string, error) {
	if err := validKey(key); err != nil {
		return "", err
	}
	path := filepath.Join(l.Dir, filepath.FromSlash(key))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return "", err
	}
	if err := os.Rename(tmp, path); err != nil {
		return "", err
	}
	return strings.TrimRight(l.URLPrefix, "/") + "/" + key, nil
}

func (l Local) Delete(_ context.Context, key string) error {
	if err := validKey(key); err != nil {
		return err
	}
	err := os.Remove(filepath.Join(l.Dir, filepath.FromSlash(key)))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}
