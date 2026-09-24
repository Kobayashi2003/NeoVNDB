package vndb

import "testing"

// Values are real ones taken from the dump, so a change to the recipe table is
// checked against what the data actually holds rather than an invented shape.
func TestBuildExtLink(t *testing.T) {
	cases := []struct {
		site, value string
		want        string
	}{
		{"steam", "616620", "https://store.steampowered.com/app/616620/"},
		{"twitter", "tamwoo_k", "https://x.com/tamwoo_k"},
		{"anidb", "8996", "https://anidb.net/cr8996"},

		// The nine sites vndb builds with a subroutine. Without an affiliate
		// code and without extlinks.data, which the dump does not export, each
		// reduces to one fixed form.
		{"dlsite", "RJ084627", "https://www.dlsite.com/home/work/=/product_id/RJ084627.html"},
		{"appstore", "1495137938", "https://apps.apple.com/app/id1495137938"},
		{"mg", "131", "https://www.mangagamer.com/r18/detail.php?product_code=131"},
		{"playasia", "2dl", "https://www.play-asia.com/13/702dl"},
		{"denpa", "seduced-by-a-magic-milf", "https://denpasoft.com/product/seduced-by-a-magic-milf/"},
		{"jlist", "target-pheromone-download-edition", "https://jlist.com/shop/product/target-pheromone-download-edition"},
		{"kagura", "angelic-chaos-re-boot", "https://www.kaguragames.com/product/angelic-chaos-re-boot/"},
		{"jastusa", "pushp003", "https://jastusa.com/games/pushp003/vndb"},

		// itch is the one whose value carries two path segments.
		{"itch", "cringegames/romancing-the-kingdom-demo",
			"https://cringegames.itch.io/romancing-the-kingdom-demo"},
	}

	for _, c := range cases {
		link, ok := BuildExtLink(c.site, c.value)
		if !ok {
			t.Errorf("%s: no link built", c.site)
			continue
		}
		if link.URL != c.want {
			t.Errorf("%s:\n got %s\nwant %s", c.site, link.URL, c.want)
		}
	}
}

func TestBuildExtLinkRejects(t *testing.T) {
	cases := []struct{ name, site, value string }{
		{"unknown site", "nosuchsite", "123"},
		{"non-numeric where a number is required", "anidb", "abc"},
		{"itch without both segments", "itch", "onlyone"},
	}
	for _, c := range cases {
		if link, ok := BuildExtLink(c.site, c.value); ok {
			t.Errorf("%s: expected no link, got %s", c.name, link.URL)
		}
	}
}

func TestFormatReleased(t *testing.T) {
	cases := []struct {
		in   int32
		want string
	}{
		{20020829, "2002-08-29"},
		{20020899, "2002-08"},
		{20029999, "2002"},
		{99999999, "TBA"},
		{0, ""},
	}
	for _, c := range cases {
		if got := FormatReleased(c.in); got != c.want {
			t.Errorf("FormatReleased(%d) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestParseReleasedRange(t *testing.T) {
	cases := []struct {
		in        string
		low, high int32
	}{
		{"2002", 20020000, 20029999},
		{"2002-08", 20020800, 20020899},
		{"2002-08-29", 20020829, 20020829},
		{"TBA", 99990000, 99999999},
	}
	for _, c := range cases {
		low, high, err := ParseReleasedRange(c.in)
		if err != nil {
			t.Errorf("ParseReleasedRange(%q): %v", c.in, err)
			continue
		}
		if low != c.low || high != c.high {
			t.Errorf("ParseReleasedRange(%q) = %d..%d, want %d..%d", c.in, low, high, c.low, c.high)
		}
	}
	if _, _, err := ParseReleasedRange("20x2"); err == nil {
		t.Error("ParseReleasedRange accepted a non-date")
	}
}

func TestIDRoundTrip(t *testing.T) {
	if got := FormatID(TypeVN, 17); got != "v17" {
		t.Errorf("FormatID = %q, want v17", got)
	}
	for _, in := range []string{"v17", "17"} {
		id, err := ParseID(TypeVN, in)
		if err != nil || id != 17 {
			t.Errorf("ParseID(%q) = %d, %v", in, id, err)
		}
	}
	if _, err := ParseID(TypeVN, "c17"); err == nil {
		t.Error("ParseID accepted a character id as a vn id")
	}
	for _, in := range []string{"v+17", "v-17", "+17", "v99999999999", "v", ""} {
		if id, err := ParseID(TypeVN, in); err == nil {
			t.Errorf("ParseID(%q) = %d, want an error", in, id)
		}
	}
}

func TestImageURL(t *testing.T) {
	// The path shards on the last two digits, zero-padded.
	if got := ImageURL("cv", 20339); got != "https://t.vndb.org/cv/39/20339.jpg" {
		t.Errorf("ImageURL = %q", got)
	}
	if got := ImageURL("ch", 12); got != "https://t.vndb.org/ch/12/12.jpg" {
		t.Errorf("ImageURL = %q", got)
	}
	if got := ImageURL("sf", 5); got != "https://t.vndb.org/sf/05/5.jpg" {
		t.Errorf("ImageURL = %q", got)
	}
}
