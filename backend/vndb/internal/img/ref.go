package img

import (
	"fmt"
	"strconv"
	"strings"
)

// Kinds vndb serves. cv is a cover and cv.t its 256px thumbnail, ch a
// character portrait, sf a screenshot and st that screenshot's thumbnail. The
// thumbnails are upstream's, not ours, and are mirrored like any other original.
var kinds = map[string]bool{"cv": true, "cv.t": true, "ch": true, "sf": true, "st": true}

// A Ref names one image the way vndb does, and is everything needed to find
// it: no database is consulted to serve a request, because the request already
// says which file it wants.
type Ref struct {
	Kind string
	Num  int32
}

// Shard is the directory vndb files an image under, which is the last two
// digits of its number. Kept here as well as in the vndb package because this
// is where a request is parsed back into a Ref, and the two must agree.
func (r Ref) Shard() int32 { return r.Num % 100 }

func (r Ref) String() string { return fmt.Sprintf("%s/%d", r.Kind, r.Num) }

// ParseRef reads the tail of a request path: kind, shard, number. The shard is
// checked rather than ignored -- it is redundant with the number, and a
// mismatch means the caller built the path wrong, which is worth saying rather
// than quietly serving the right image for the wrong URL.
func ParseRef(path string) (Ref, error) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) != 3 {
		return Ref{}, fmt.Errorf("expected <kind>/<shard>/<num>.jpg")
	}
	kind, shard, file := parts[0], parts[1], parts[2]

	if !kinds[kind] {
		return Ref{}, fmt.Errorf("unknown image kind %q", kind)
	}
	name, ok := strings.CutSuffix(file, ".jpg")
	if !ok {
		return Ref{}, fmt.Errorf("expected a .jpg")
	}
	num, err := strconv.ParseInt(name, 10, 32)
	if err != nil || num <= 0 {
		return Ref{}, fmt.Errorf("%q is not an image number", name)
	}
	ref := Ref{Kind: kind, Num: int32(num)}

	if got, err := strconv.Atoi(shard); err != nil || int32(got) != ref.Shard() {
		return Ref{}, fmt.Errorf("%s belongs under %02d, not %q", file, ref.Shard(), shard)
	}
	return ref, nil
}

// Thumbnails are upstream's smaller copies of a kind. vndb makes a cover's
// only when the cover is wider than the thumbnail (older covers were stored at
// that size already); every screenshot has one.
var thumbnails = map[string]string{"cv": "cv.t", "sf": "st"}

const coverThumbnailWidth = 256

// Thumbnail is the upstream thumbnail of an image of this kind and width, if
// vndb publishes one.
func Thumbnail(r Ref, width int) (Ref, bool) {
	kind, ok := thumbnails[r.Kind]
	if !ok || (r.Kind == "cv" && width <= coverThumbnailWidth) {
		return Ref{}, false
	}
	return Ref{Kind: kind, Num: r.Num}, true
}

// baseOf is the image a thumbnail was made from.
func baseOf(thumb Ref) (Ref, bool) {
	for kind, t := range thumbnails {
		if t == thumb.Kind {
			return Ref{Kind: kind, Num: thumb.Num}, true
		}
	}
	return Ref{}, false
}
