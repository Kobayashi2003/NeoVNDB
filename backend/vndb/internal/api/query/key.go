package query

import (
	"sort"
	"strconv"
	"strings"
)

// Canonical is the cache key: built from the parsed request so equivalent
// requests (fields=a,b and fields=b,a) share one entry. The limits are part of
// it so raising a ceiling doesn't serve a cached refusal.
func (r *Request) Canonical(entity string) string {
	var b strings.Builder
	b.WriteString(entity)

	b.WriteString("|f=")
	names := make([]string, 0, len(r.Filters))
	for name := range r.Filters {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		b.WriteString(name)
		b.WriteByte('=')
		b.WriteString(r.Filters[name])
		b.WriteByte(';')
	}

	b.WriteString("|e=")
	b.WriteString(r.Filter)

	b.WriteString("|s=")
	b.WriteString(r.Sort)
	if r.Reverse {
		b.WriteString("-desc")
	}
	b.WriteString("|p=")
	b.WriteString(strconv.Itoa(r.Page))
	b.WriteByte('/')
	b.WriteString(strconv.Itoa(r.Limit))
	if r.Paged {
		b.WriteString("+paged")
	}

	b.WriteString("|x=")
	writeSelection(&b, r.Fields)

	b.WriteString("|l=")
	for _, n := range []int{r.Limits.MaxPageSize, r.Limits.MaxIDs,
		r.Limits.MaxFieldDepth, r.Limits.MaxCost, r.Limits.MaxSearchTerms,
		r.Limits.MaxFilterNodes} {
		b.WriteString(strconv.Itoa(n))
		b.WriteByte(',')
	}
	return b.String()
}

func writeSelection(b *strings.Builder, sel Selection) {
	if sel.All {
		b.WriteByte('*')
	}
	cols := append([]string(nil), sel.Columns...)
	sort.Strings(cols)
	for _, c := range cols {
		b.WriteString(c)
		b.WriteByte(',')
	}

	names := make([]string, 0, len(sel.Fragments))
	for name := range sel.Fragments {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		b.WriteString(name)
		b.WriteByte('{')
		writeSelection(b, sel.Fragments[name])
		b.WriteByte('}')
	}
}
