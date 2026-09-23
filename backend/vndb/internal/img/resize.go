package img

import (
	"bytes"
	"fmt"
	"image"
	"image/jpeg"

	"golang.org/x/image/draw"
)

// Sources are already lossy; higher quality mostly preserves their artefacts.
const quality = 82

// Scale narrows the image to width, or returns the original bytes (and false)
// when it is already no wider, as every character portrait is.
func Scale(original []byte, width, maxPixels int) ([]byte, bool, error) {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(original))
	if err != nil {
		return nil, false, fmt.Errorf("reading image header: %w", err)
	}
	if cfg.Width <= width {
		return original, false, nil
	}
	// A few covers exceed 15000px square; refuse rather than decode.
	if cfg.Width*cfg.Height > maxPixels {
		return nil, false, fmt.Errorf("image is %dx%d, past the %d pixel limit", cfg.Width, cfg.Height, maxPixels)
	}

	src, _, err := image.Decode(bytes.NewReader(original))
	if err != nil {
		return nil, false, fmt.Errorf("decoding image: %w", err)
	}

	bounds := src.Bounds()
	height := bounds.Dy() * width / bounds.Dx()
	if height < 1 {
		height = 1
	}
	dst := image.NewRGBA(image.Rect(0, 0, width, height))
	// CatmullRom: each copy is made once and cached.
	draw.CatmullRom.Scale(dst, dst.Bounds(), src, bounds, draw.Over, nil)

	var out bytes.Buffer
	if err := jpeg.Encode(&out, dst, &jpeg.Options{Quality: quality}); err != nil {
		return nil, false, fmt.Errorf("encoding image: %w", err)
	}
	return out.Bytes(), true, nil
}

// Widths are the allowed sizes; requests round up, so arbitrary widths can't
// fill the disk.
type Widths []int

// Nearest returns the smallest listed width at or above want, or the largest
// listed one when want is past the end.
func (w Widths) Nearest(want int) int {
	for _, n := range w {
		if want <= n {
			return n
		}
	}
	return w[len(w)-1]
}
