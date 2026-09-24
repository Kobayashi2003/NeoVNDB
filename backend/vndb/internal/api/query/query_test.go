package query

import (
	"net/http/httptest"
	"testing"
)

func parse(query string, lim Limits) (*Request, error) {
	cat, _ := setup()
	return Parse(cat, testTable.Registry(), lim, httptest.NewRequest("GET", "/vn?"+query, nil))
}

func TestParseRequest(t *testing.T) {
	req, err := parse("fields=title&sort=rating&reverse=true&page=3&limit=20&lang=en&f=olang%3Dja", lim)
	if err != nil {
		t.Fatal(err)
	}
	if req.Sort != "rating" || !req.Reverse || req.Page != 3 || req.Limit != 20 || req.Offset() != 40 {
		t.Errorf("paging: %+v", req)
	}
	// Reserved names never become filters; everything else does.
	if len(req.Filters) != 1 || req.Filters["lang"] != "en" {
		t.Errorf("filters = %v", req.Filters)
	}
	if req.Filter != "olang=ja" {
		t.Errorf("f = %q", req.Filter)
	}

	req, err = parse("", lim)
	if err != nil || req.Page != 1 || req.Limit != lim.PageSize {
		t.Errorf("defaults: %v %+v", err, req)
	}
}

func TestParseRequestRefuses(t *testing.T) {
	small := lim
	small.MaxPageSize = 50
	for _, q := range []string{
		"page=0", "page=-1", "page=two",
		"limit=0", "limit=51", "limit=x",
		"f=(olang%3Dja", // unclosed
		"fields=nosuch",
	} {
		if _, err := parse(q, small); err == nil || !IsClientError(err) {
			t.Errorf("%s: got %v, want a client error", q, err)
		}
	}
}

func TestParseRequestCost(t *testing.T) {
	tight := lim
	tight.MaxCost = 1
	if _, err := parse("fields=title&limit=10", tight); err == nil {
		t.Error("a request over the cost ceiling was accepted")
	}
	tight.MaxCost = 0 // no ceiling
	if _, err := parse("fields=title&limit=10", tight); err != nil {
		t.Errorf("no ceiling: %v", err)
	}
}
