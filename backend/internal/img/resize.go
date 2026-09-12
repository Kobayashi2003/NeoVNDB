package img

import (
	"bytes"
	"fmt"
	"image"
	"image/jpeg"

	"golang.org/x/image/draw"
)

// quality is where a cover stops looking better and only gets larger. vndb's
// own covers are already lossy, so re-encoding above this mostly preserves the
// first encoder's artefacts at a higher bitrate.
const quality = 82

// Scale returns the image narrowed to width, or the original bytes when it is
// already no wider than that. The second case is most of them: character
// portraits are at most 256 across upstream, so every width a page asks for
// passes them through with no decode at all.
//
// The returned bool says whether anything was done, which the caller needs in
// order to decide whether the result is worth storing as a derivative.
func Scale(original []byte, width, maxPixels int) ([]byte, bool, error) {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(original))
	if err != nil {
		return nil, false, fmt.Errorf("reading image header: %w", err)
	}
	if cfg.Width <= width {
		return original, false, nil
	}
	// Refusing is better than serving slowly: a handful of covers are upwards
	// of 15000 pixels square, and decoding one costs more than every other
	// request in flight put together.
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
	// CatmullRom rather than a cheaper kernel: these are drawn once and read
	// from disk forever after, so the cost is paid a single time per image.
	draw.CatmullRom.Scale(dst, dst.Bounds(), src, bounds, draw.Over, nil)

	var out bytes.Buffer
	if err := jpeg.Encode(&out, dst, &jpeg.Options{Quality: quality}); err != nil {
		return nil, false, fmt.Errorf("encoding image: %w", err)
	}
	return out.Bytes(), true, nil
}

// Widths is the set of sizes a caller may ask for.
//
// Unbounded widths would be both a disk and a processor problem: every
// unseen number is one more decode and one more file, so a caller cycling
// through them would fill the disk and keep the machine busy while never
// hitting the cache. A request is rounded up to the next listed width rather
// than refused, which protects the same and is easier to call.
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
