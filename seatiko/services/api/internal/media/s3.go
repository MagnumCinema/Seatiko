package media

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// S3 is an S3-compatible bucket signed with AWS Signature V4 (no SDK).
type S3 struct {
	Endpoint  string // https://s3.eu-central-1.amazonaws.com, https://<account>.r2.cloudflarestorage.com, http://minio:9000
	Region    string // "us-east-1" for MinIO, "auto" for R2
	Bucket    string
	AccessKey string
	SecretKey string
	// PublicURL is the base for returned URLs (CDN or public bucket); default Endpoint/Bucket.
	PublicURL string
	// PathStyle: https://host/bucket/key (MinIO, R2) instead of https://bucket.host/key.
	PathStyle bool
	Client    *http.Client
	now       func() time.Time
}

func (s *S3) client() *http.Client {
	if s.Client != nil {
		return s.Client
	}
	return &http.Client{Timeout: 30 * time.Second}
}

func (s *S3) objectURL(key string) (*url.URL, error) {
	base, err := url.Parse(strings.TrimRight(s.Endpoint, "/"))
	if err != nil || base.Host == "" {
		return nil, fmt.Errorf("invalid S3 endpoint %q", s.Endpoint)
	}
	prefix := "/"
	if s.PathStyle {
		prefix = "/" + s.Bucket + "/"
	} else {
		base.Host = s.Bucket + "." + base.Host
	}
	base.Path = prefix + key
	base.RawPath = prefix + escapePath(key)
	return base, nil
}

// PublicObjectURL is where clients load the object.
func (s *S3) PublicObjectURL(key string) string {
	if s.PublicURL != "" {
		return strings.TrimRight(s.PublicURL, "/") + "/" + escapePath(key)
	}
	u, err := s.objectURL(key)
	if err != nil {
		return ""
	}
	return u.String()
}

func (s *S3) Put(ctx context.Context, key, contentType string, data []byte) (string, error) {
	if err := validKey(key); err != nil {
		return "", err
	}
	headers := map[string]string{"Content-Type": contentType, "Cache-Control": "public, max-age=31536000, immutable"}
	if err := s.do(ctx, http.MethodPut, key, data, headers); err != nil {
		return "", err
	}
	return s.PublicObjectURL(key), nil
}

func (s *S3) Delete(ctx context.Context, key string) error {
	if err := validKey(key); err != nil {
		return err
	}
	return s.do(ctx, http.MethodDelete, key, nil, nil)
}

func (s *S3) do(ctx context.Context, method, key string, body []byte, headers map[string]string) error {
	u, err := s.objectURL(key)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, method, u.String(), bytes.NewReader(body))
	if err != nil {
		return err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	req.ContentLength = int64(len(body))
	s.sign(req, body)
	res, err := s.client().Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode/100 != 2 {
		msg, _ := io.ReadAll(io.LimitReader(res.Body, 512))
		return fmt.Errorf("s3 %s %s: %d %s", method, key, res.StatusCode, strings.TrimSpace(string(msg)))
	}
	return nil
}

// sign adds AWS Signature V4 headers (service "s3", payload hash included).
func (s *S3) sign(req *http.Request, body []byte) {
	now := time.Now().UTC()
	if s.now != nil {
		now = s.now().UTC()
	}
	amzDate := now.Format("20060102T150405Z")
	day := now.Format("20060102")
	region := s.Region
	if region == "" {
		region = "us-east-1"
	}
	payloadHash := sha256Hex(body)
	req.Header.Set("Host", req.URL.Host)
	req.Header.Set("X-Amz-Date", amzDate)
	req.Header.Set("X-Amz-Content-Sha256", payloadHash)

	names := []string{"host"}
	values := map[string]string{"host": req.URL.Host}
	for name := range req.Header {
		lower := strings.ToLower(name)
		if lower == "host" || lower == "authorization" || lower == "content-length" {
			continue
		}
		names = append(names, lower)
		values[lower] = strings.TrimSpace(req.Header.Get(name))
	}
	sortStrings(names)
	var canonHeaders strings.Builder
	for _, n := range names {
		canonHeaders.WriteString(n + ":" + values[n] + "\n")
	}
	signedHeaders := strings.Join(names, ";")
	canonical := strings.Join([]string{
		req.Method,
		req.URL.EscapedPath(),
		req.URL.RawQuery,
		canonHeaders.String(),
		signedHeaders,
		payloadHash,
	}, "\n")
	scope := day + "/" + region + "/s3/aws4_request"
	toSign := "AWS4-HMAC-SHA256\n" + amzDate + "\n" + scope + "\n" + sha256Hex([]byte(canonical))
	key := hmacSHA256([]byte("AWS4"+s.SecretKey), day)
	key = hmacSHA256(key, region)
	key = hmacSHA256(key, "s3")
	key = hmacSHA256(key, "aws4_request")
	signature := hex.EncodeToString(hmacSHA256(key, toSign))
	req.Header.Set("Authorization", fmt.Sprintf("AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		s.AccessKey, scope, signedHeaders, signature))
}

func sha256Hex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func hmacSHA256(key []byte, msg string) []byte {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(msg))
	return m.Sum(nil)
}

// escapePath URI-encodes each path segment the way S3 SigV4 expects (keeps "/").
func escapePath(key string) string {
	parts := strings.Split(key, "/")
	for i, p := range parts {
		parts[i] = strings.ReplaceAll(url.PathEscape(p), "+", "%2B")
	}
	return strings.Join(parts, "/")
}

func sortStrings(a []string) {
	for i := 1; i < len(a); i++ {
		for j := i; j > 0 && a[j] < a[j-1]; j-- {
			a[j], a[j-1] = a[j-1], a[j]
		}
	}
}
