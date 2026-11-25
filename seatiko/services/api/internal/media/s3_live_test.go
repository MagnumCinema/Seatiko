package media

import (
	"context"
	"io"
	"net/http"
	"os"
	"testing"
)

// Runs against a real S3-compatible server when S3_TEST_ENDPOINT is set (e.g. MinIO).
func TestS3LiveRoundTrip(t *testing.T) {
	endpoint := os.Getenv("S3_TEST_ENDPOINT")
	if endpoint == "" {
		t.Skip("S3_TEST_ENDPOINT not set")
	}
	s := &S3{Endpoint: endpoint, Bucket: os.Getenv("S3_TEST_BUCKET"), AccessKey: os.Getenv("S3_TEST_ACCESS_KEY"),
		SecretKey: os.Getenv("S3_TEST_SECRET_KEY"), PathStyle: true}
	ctx := context.Background()
	key := "avatars/live test/ok+1.jpg"
	url, err := s.Put(ctx, key, "image/jpeg", []byte("hello s3"))
	if err != nil {
		t.Fatalf("put: %v", err)
	}
	res, err := http.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode != 200 || string(body) != "hello s3" || res.Header.Get("Content-Type") != "image/jpeg" {
		t.Fatalf("public GET %s: %d %q %s", url, res.StatusCode, body, res.Header.Get("Content-Type"))
	}
	if err := s.Delete(ctx, key); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if res, _ := http.Get(url); res == nil || res.StatusCode != 404 {
		t.Fatalf("object still served after delete")
	}
	bad := *s
	bad.SecretKey = "wrong"
	if _, err := bad.Put(ctx, key, "image/jpeg", []byte("x")); err == nil {
		t.Fatal("wrong secret accepted: signature is not checked?")
	}
}
