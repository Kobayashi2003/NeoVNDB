package query

// Matching is the WHERE clause of a request over spec's table and its
// arguments, for a statement that aggregates the rows a list would show. The
// caller's own arguments are numbered from len(args)+1.
func Matching(spec PageSpec, req *Request) (string, []any, error) {
	b := &Builder{Limits: req.Limits, Types: req.cat, Budget: req.budget}
	if _, err := conditions(spec, req, b, ""); err != nil {
		return "", nil, err
	}
	return b.SQL(), b.Args, nil
}
