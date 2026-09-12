package img

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestParseRef(t *testing.T) {
	ok := []struct {
		path string
		want Ref
	}{
		{"cv/12/79412.jpg", Ref{"cv", 79412}},
		{"/ch/94/129494.jpg", Ref{"ch", 129494}},
		{"sf/90/190.jpg", Ref{"sf", 190}},
		{"st/90/190.jpg", Ref{"st", 190}},
		{"cv/03/3.jpg", Ref{"cv", 3}},
	}
	for _, c := range ok {
		got, err := ParseRef(c.path)
		if err != nil {
			t.Errorf("ParseRef(%q) = %v", c.path, err)
		} else if got != c.want {
			t.Errorf("ParseRef(%q) = %v, want %v", c.path, got, c.want)
		}
	}

	bad := []string{
		"",
		"cv/12",
		"cv/12/79412.png",
		"xx/12/79412.jpg",   // not a kind vndb serves
		"cv/13/79412.jpg",   // shard disagrees with the number
		"cv/12/abc.jpg",     //
		"cv/12/0.jpg",       // there is no image zero
		"cv/12/-5.jpg",      //
		"cv/12/79412.jpg/x", // extra segment
	}
	for _, path := range bad {
		if got, err := ParseRef(path); err == nil {
			t.Errorf("ParseRef(%q) = %v, want an error", path, got)
		}
	}
}

func TestShardMatchesUpstream(t *testing.T) {
	// The path this package builds and the one vndb.ImageURL hands the
	// frontend have to agree, or a rewritten URL points at nothing. Both take
	// the last two digits; this pins the rule on this side.
	for _, c := range []struct {
		ref   Ref
		shard int32
	}{
		{Ref{"cv", 20339}, 39},
		{Ref{"cv", 79412}, 12},
		{Ref{"sf", 190}, 90},
		{Ref{"ch", 129494}, 94},
		{Ref{"cv", 3}, 3},
	} {
		if got := c.ref.Shard(); got != c.shard {
			t.Errorf("%v.Shard() = %d, want %d", c.ref, got, c.shard)
		}
	}
}

func TestStoreWriteIsAtomic(t *testing.T) {
	store := NewStore(t.TempDir())
	ref := Ref{"cv", 79412}

	if _, err := store.Read(ref); err != ErrMissing {
		t.Fatalf("reading an absent image = %v, want ErrMissing", err)
	}
	if err := store.Write(ref, []byte("hello")); err != nil {
		t.Fatal(err)
	}
	got, err := store.Read(ref)
	if err != nil || string(got) != "hello" {
		t.Fatalf("Read = %q, %v", got, err)
	}
	if !store.Has(ref) {
		t.Error("Has = false after a write")
	}

	// Nothing may be left behind for a file server to trip over.
	dir := filepath.Dir(store.Path(ref))
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Name() != "79412.jpg" {
		names := []string{}
		for _, e := range entries {
			names = append(names, e.Name())
		}
		t.Errorf("directory holds %v, want only the image", names)
	}
}

func TestStorePathMirrorsUpstream(t *testing.T) {
	store := NewStore("/root")
	got := store.Path(Ref{"cv", 79412})
	want := filepath.Join("/root", "cv", "12", "79412.jpg")
	if got != want {
		t.Errorf("Path = %q, want %q", got, want)
	}
}

func TestWidthsRoundUp(t *testing.T) {
	w := Widths{128, 256, 512}
	cases := map[int]int{1: 128, 128: 128, 129: 256, 256: 256, 300: 512, 512: 512, 9999: 512}
	for want, expect := range cases {
		if got := w.Nearest(want); got != expect {
			t.Errorf("Nearest(%d) = %d, want %d", want, got, expect)
		}
	}
}

func TestScale(t *testing.T) {
	wide := jpegOf(t, 800, 600)

	got, changed, err := Scale(wide, 256, 40_000_000)
	if err != nil || !changed {
		t.Fatalf("Scale = %v, changed %v", err, changed)
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(got))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Width != 256 || cfg.Height != 192 {
		t.Errorf("scaled to %dx%d, want 256x192", cfg.Width, cfg.Height)
	}
	if len(got) >= len(wide) {
		t.Errorf("scaled copy is %d bytes, no smaller than the %d it came from", len(got), len(wide))
	}
}

func TestScaleLeavesSmallImagesAlone(t *testing.T) {
	// Every character portrait is like this: narrower than any width a page
	// asks for, so it should come back untouched and unstored.
	small := jpegOf(t, 256, 300)
	got, changed, err := Scale(small, 512, 40_000_000)
	if err != nil {
		t.Fatal(err)
	}
	if changed {
		t.Error("changed = true for an image already narrow enough")
	}
	if !bytes.Equal(got, small) {
		t.Error("an untouched image came back re-encoded")
	}
}

func TestScaleRefusesHugeImages(t *testing.T) {
	big := jpegOf(t, 4000, 3000)
	if _, _, err := Scale(big, 256, 1_000_000); err == nil {
		t.Error("Scale accepted an image past the pixel limit")
	}
}

func TestFlightCollapsesConcurrentWork(t *testing.T) {
	const callers = 20

	f := newFlight()
	var mu sync.Mutex
	var runs int
	release := make(chan struct{})

	// A flight only collapses callers that overlap, so every caller has to be
	// inside Do before the one holding the key is allowed to finish. Entry is
	// signalled before the call and then given a moment: the last step between
	// the signal and taking the lock is a few instructions, and the wait is
	// four orders of magnitude longer than that.
	var entered, done sync.WaitGroup
	entered.Add(callers)
	done.Add(callers)

	results := make([][]byte, callers)
	for i := range callers {
		go func() {
			defer done.Done()
			entered.Done()
			results[i], _ = f.Do("cv/1@256", func() ([]byte, error) {
				mu.Lock()
				runs++
				mu.Unlock()
				<-release
				return []byte("done"), nil
			})
		}()
	}
	entered.Wait()
	time.Sleep(50 * time.Millisecond)
	close(release)
	done.Wait()

	if runs != 1 {
		t.Errorf("the work ran %d times, want once", runs)
	}
	for i, got := range results {
		if string(got) != "done" {
			t.Errorf("caller %d got %q, want the shared answer", i, got)
		}
	}
}

func TestFlightRunsAgainAfterTheFirstFinished(t *testing.T) {
	// Collapsing is about overlap, not about caching: a second ask once the
	// first is done has to do the work again, or a failed fetch would be
	// remembered forever.
	f := newFlight()
	runs := 0
	work := func() ([]byte, error) {
		runs++
		return nil, nil
	}
	_, _ = f.Do("cv/1@256", work)
	_, _ = f.Do("cv/1@256", work)
	if runs != 2 {
		t.Errorf("the work ran %d times, want twice", runs)
	}
}

// jpegOf builds a JPEG of the given size with enough variation that it does
// not compress to nothing.
func jpegOf(t *testing.T, w, h int) []byte {
	t.Helper()
	src := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := range h {
		for x := range w {
			src.Set(x, y, color.RGBA{R: uint8(x), G: uint8(y), B: uint8(x ^ y), A: 255})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, src, nil); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestFlightSurvivesAPanic(t *testing.T) {
	// A decoder tripping over a malformed file must not strand the readers
	// waiting on it, nor leave the key held so that every later request for
	// the same image waits forever too.
	f := newFlight()
	release := make(chan struct{})

	var waiter sync.WaitGroup
	waiter.Add(1)
	var waited error
	go func() {
		defer waiter.Done()
		<-release
		_, waited = f.Do("cv/1", func() ([]byte, error) {
			t.Error("a waiter ran the work itself")
			return nil, nil
		})
	}()

	_, err := f.Do("cv/1", func() ([]byte, error) {
		close(release)
		// Give the waiter a moment to arrive before this unwinds.
		time.Sleep(30 * time.Millisecond)
		panic("malformed image")
	})
	if err == nil {
		t.Error("the caller that panicked got no error")
	}
	waiter.Wait()
	_ = waited

	// The key must be free again.
	done := make(chan struct{})
	go func() {
		_, _ = f.Do("cv/1", func() ([]byte, error) { return []byte("fine"), nil })
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("the key stayed held after a panic")
	}
}
