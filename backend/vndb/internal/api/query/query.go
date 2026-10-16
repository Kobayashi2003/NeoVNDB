// Package query is the machinery every entity type shares: request parsing,
// field validation and the dynamic half of the SQL. Type packages implement
// Resolver; the HTTP layer only sees that interface.
package query

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
)

// Resolver is one entity type: what it can be asked for, and how to answer.
type Resolver interface {
	Registry() Registry
	Resolve(ctx context.Context, r *Request) (results []map[string]any, total int, err error)
}

// Request is one validated call against the unified endpoint.
type Request struct {
	Fields  Selection
	Filters map[string]string
	// The f= expression as written (the cache key) and as parsed.
	Filter string
	expr   node
	// budget is shared by the expression and every condition nested in it.
	cat     *Catalog
	budget  *int
	Sort    string
	Reverse bool
	Page    int
	Limit   int
	// Paged says page= or limit= was given, which an id lookup honours.
	Paged  bool
	Limits Limits
}

// Reserved parameter names; everything else in the query string is a filter.
var reserved = map[string]bool{
	"fields": true, "sort": true, "reverse": true, "page": true, "limit": true,
	"f": true,
}

func Parse(cat *Catalog, reg Registry, lim Limits, r *http.Request) (*Request, error) {
	values := r.URL.Query()
	fields, err := ParseFields(cat, reg, lim.MaxFieldDepth, values.Get("fields"))
	if err != nil {
		return nil, err
	}

	req := &Request{
		Fields:  fields,
		Filters: map[string]string{},
		Sort:    values.Get("sort"),
		Reverse: values.Get("reverse") == "true",
		Page:    1,
		Limit:   lim.PageSize,
		Limits:  lim,
		Paged:   values.Has("page") || values.Has("limit"),
	}

	if raw := values.Get("page"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 {
			return nil, BadRequest("page must be a positive number")
		}
		req.Page = n
	}
	if raw := values.Get("limit"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 {
			return nil, BadRequest("limit must be a positive number")
		}
		if lim.MaxPageSize > 0 && n > lim.MaxPageSize {
			return nil, BadRequest("limit may not exceed %d", lim.MaxPageSize)
		}
		req.Limit = n
	}
	req.cat, req.budget = cat, Budget(lim.MaxFilterNodes)
	if raw := values.Get("f"); raw != "" {
		expr, err := ParseExpr(raw, req.budget)
		if err != nil {
			return nil, err
		}
		req.Filter, req.expr = raw, expr
	}
	if cost := Cost(cat, reg, fields, req.Limit); lim.MaxCost > 0 && cost > lim.MaxCost {
		return nil, BadRequest("too much data selected (estimated %d values, limit %d); "+
			"lower the limit or ask for fewer fields", cost, lim.MaxCost)
	}

	for name, vs := range values {
		if reserved[name] || len(vs) == 0 {
			continue
		}
		req.Filters[name] = vs[0]
	}
	return req, nil
}

func (r *Request) Offset() int { return (r.Page - 1) * r.Limit }

// ClientError reaches the client verbatim as a 400; anything else is logged
// and reported as a bare 500.
type ClientError struct{ msg string }

func (e *ClientError) Error() string { return e.msg }

func BadRequest(format string, args ...any) error {
	return &ClientError{msg: fmt.Sprintf(format, args...)}
}

func IsClientError(err error) bool {
	var ce *ClientError
	return errors.As(err, &ce)
}
