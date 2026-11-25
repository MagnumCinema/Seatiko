package media

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// AWS documentation example "GET Object" (Signature V4, single chunk).
func TestS3SignMatchesAWSExample(t *testing.T) {
	s := &S3{
		Endpoint: "https://s3.amazonaws.com", Region: "us-east-1", Bucket: "examplebucket",
		AccessKey: "AKIAIOSFODNN7EXAMPLE", SecretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
		now: func() time.Time { return time.Date(2013, 5, 24, 0, 0, 0, 0, time.UTC) },
	}
	u, _ := s.objectURL("test.txt")
	req, _ := http.NewRequest(http.MethodGet, u.String(), nil)
	req.Header.Set("Range", "bytes=0-9")
	s.sign(req, nil)
	want := "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, " +
		"SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, " +
		"Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41"
	if got := req.Header.Get("Authorization"); got != want {
		t.Fatalf("Authorization\n got %s\nwant %s", got, want)
	}
}

func TestS3URLs(t *testing.T) {
	path := &S3{Endpoint: "http://minio:9000", Bucket: "seatiko", PathStyle: true}
	if got := path.PublicObjectURL("avatars/u 1/a.jpg"); got != "http://minio:9000/seatiko/avatars/u%201/a.jpg" {
		t.Fatalf("path style URL %s", got)
	}
	cdn := &S3{Endpoint: "https://s3.eu-central-1.amazonaws.com", Bucket: "b", PublicURL: "https://cdn.example.com/"}
	if got := cdn.PublicObjectURL("avatars/a.jpg"); got != "https://cdn.example.com/avatars/a.jpg" {
		t.Fatalf("public URL %s", got)
	}
	vhost := &S3{Endpoint: "https://s3.eu-central-1.amazonaws.com", Bucket: "b"}
	if got := vhost.PublicObjectURL("a.jpg"); got != "https://b.s3.eu-central-1.amazonaws.com/a.jpg" {
		t.Fatalf("virtual host URL %s", got)
	}
}

func TestLocalStore(t *testing.T) {
	dir := t.TempDir()
	l := Local{Dir: dir, URLPrefix: "/uploads"}
	url, err := l.Put(context.Background(), "avatars/u1/x.jpg", "image/jpeg", []byte("abc"))
	if err != nil || url != "/uploads/avatars/u1/x.jpg" {
		t.Fatalf("put: %v %s", err, url)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "avatars/u1/x.jpg")); string(b) != "abc" {
		t.Fatal("file not written")
	}
	if err := l.Delete(context.Background(), "avatars/u1/x.jpg"); err != nil {
		t.Fatal(err)
	}
	if err := l.Delete(context.Background(), "avatars/u1/x.jpg"); err != nil {
		t.Fatal("deleting a missing file must be a no-op")
	}
	if _, err := l.Put(context.Background(), "../escape.jpg", "image/jpeg", nil); err == nil {
		t.Fatal("path traversal key accepted")
	}
}

func pngBytes(w, h int) []byte {
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	for x := 0; x < w; x++ {
		img.Set(x, 0, color.NRGBA{255, 0, 0, 255})
	}
	var b bytes.Buffer
	_ = png.Encode(&b, img)
	return b.Bytes()
}

func TestProcessAvatar(t *testing.T) {
	out, err := ProcessAvatar(pngBytes(1200, 800))
	if err != nil {
		t.Fatal(err)
	}
	cfg, err := jpeg.DecodeConfig(bytes.NewReader(out))
	if err != nil || cfg.Width != AvatarSize || cfg.Height != AvatarSize {
		t.Fatalf("avatar %dx%d err %v, want %d square JPEG", cfg.Width, cfg.Height, err, AvatarSize)
	}
	small, _ := ProcessAvatar(pngBytes(100, 300))
	if cfg, _ := jpeg.DecodeConfig(bytes.NewReader(small)); cfg.Width != 100 || cfg.Height != 100 {
		t.Fatalf("small image must be cropped, not upscaled: %dx%d", cfg.Width, cfg.Height)
	}

	svg := []byte(`<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>`)
	if _, err := ProcessAvatar(svg); err != ErrUnsupportedImage {
		t.Fatalf("SVG err = %v", err)
	}
	exe := append([]byte("MZ"), bytes.Repeat([]byte{0}, 100)...)
	if _, err := ProcessAvatar(exe); err != ErrUnsupportedImage {
		t.Fatalf("executable err = %v", err)
	}
	if _, err := ProcessAvatar(bytes.Repeat([]byte{0xff}, MaxAvatarBytes+1)); err != ErrTooLarge {
		t.Fatalf("6 MB err = %v", err)
	}
	// A PNG header declaring a huge canvas must be refused before decoding.
	bomb := pngBytes(1, 1)
	copy(bomb[16:24], []byte{0, 0, 0x9c, 0x40, 0, 0, 0x9c, 0x40}) // 40000×40000
	if _, err := ProcessAvatar(bomb); err != ErrUnsupportedImage {
		t.Fatalf("decompression bomb err = %v", err)
	}
}
