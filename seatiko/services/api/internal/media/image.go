package media

import (
	"bytes"
	"errors"
	"image"
	_ "image/gif" // decoders registered for image.Decode
	"image/jpeg"
	_ "image/png"
	"net/http"

	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

const (
	MaxAvatarBytes = 5 << 20
	AvatarSize     = 512
	// maxAvatarPixels guards against decompression bombs (e.g. 1×1 MB file declaring 40000×40000).
	maxAvatarPixels = 40_000_000
)

var (
	ErrTooLarge         = errors.New("file_too_large")
	ErrUnsupportedImage = errors.New("unsupported_image")
)

// SniffImage returns the content type from the magic bytes: JPEG, PNG or WebP only
// (SVG and anything else is rejected whatever the file name says).
func SniffImage(data []byte) (string, error) {
	switch ct := http.DetectContentType(data); ct {
	case "image/jpeg", "image/png", "image/webp":
		return ct, nil
	}
	return "", ErrUnsupportedImage
}

// ProcessAvatar validates an upload and returns a square AvatarSize JPEG, centre-cropped.
// Re-encoding drops EXIF and any embedded payload.
func ProcessAvatar(data []byte) ([]byte, error) {
	if len(data) > MaxAvatarBytes {
		return nil, ErrTooLarge
	}
	if _, err := SniffImage(data); err != nil {
		return nil, err
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || cfg.Width <= 0 || cfg.Height <= 0 || cfg.Width*cfg.Height > maxAvatarPixels {
		return nil, ErrUnsupportedImage
	}
	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, ErrUnsupportedImage
	}
	b := src.Bounds()
	side := min(b.Dx(), b.Dy())
	crop := image.Rect(b.Min.X+(b.Dx()-side)/2, b.Min.Y+(b.Dy()-side)/2, 0, 0)
	crop.Max = crop.Min.Add(image.Pt(side, side))
	size := min(side, AvatarSize)
	dst := image.NewRGBA(image.Rect(0, 0, size, size))
	draw.Draw(dst, dst.Bounds(), image.White, image.Point{}, draw.Src) // flatten transparency on white
	draw.CatmullRom.Scale(dst, dst.Bounds(), src, crop, draw.Over, nil)
	var out bytes.Buffer
	if err := jpeg.Encode(&out, dst, &jpeg.Options{Quality: 86}); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}
