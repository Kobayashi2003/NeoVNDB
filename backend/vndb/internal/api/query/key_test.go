package query

import "testing"

func canonical(t *testing.T, fields string, mutate func(*Request)) string {
	t.Helper()
	cat, _ := setup()
	sel, err := ParseFields(cat, testTable.Registry(), lim.MaxFieldDepth, fields)
	if err != nil {
		t.Fatalf("fields=%q: %v", fields, err)
	}
	req := &Request{Fields: sel, Filters: map[string]string{}, Page: 1, Limit: 24, Limits: lim}
	if mutate != nil {
		mutate(req)
	}
	return req.Canonical("vn")
}

// Two requests that differ only in the order they listed things are one cache
// entry, which is the whole reason the key is built after parsing.
func TestCanonicalIgnoresOrder(t *testing.T) {
	for _, pair := range [][2]string{
		{"olang,title", "title,olang"},
		{"tags.name,tags.rating", "tags.rating,tags.name"},
		{"title,tags.name,olang", "olang,tags.name,title"},
	} {
		if a, b := canonical(t, pair[0], nil), canonical(t, pair[1], nil); a != b {
			t.Errorf("%q and %q differ:\n  %s\n  %s", pair[0], pair[1], a, b)
		}
	}

	filters := func(order []string) func(*Request) {
		return func(r *Request) {
			for _, name := range order {
				r.Filters[name] = "x"
			}
		}
	}
	if a, b := canonical(t, "title", filters([]string{"lang", "olang"})),
		canonical(t, "title", filters([]string{"olang", "lang"})); a != b {
		t.Errorf("filter order changed the key:\n  %s\n  %s", a, b)
	}
}

// Anything that changes the answer has to change the key.
func TestCanonicalSeparatesDifferentRequests(t *testing.T) {
	base := canonical(t, "title", nil)
	for name, mutate := range map[string]func(*Request){
		"a filter":       func(r *Request) { r.Filters["lang"] = "ja" },
		"a filter value": func(r *Request) { r.Filters["lang"] = "en" },
		"sort":           func(r *Request) { r.Sort = "rating" },
		"reverse":        func(r *Request) { r.Reverse = true },
		"page":           func(r *Request) { r.Page = 2 },
		"limit":          func(r *Request) { r.Limit = 50 },
		"a raised limit": func(r *Request) { r.Limits.MaxCost = 999 },
	} {
		if got := canonical(t, "title", mutate); got == base {
			t.Errorf("%s did not change the key", name)
		}
	}
	if got := canonical(t, "title,olang", nil); got == base {
		t.Error("a different field selection did not change the key")
	}
}
