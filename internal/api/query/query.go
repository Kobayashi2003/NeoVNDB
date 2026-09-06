// Package query holds the machinery every entity type shares: parsing a
// request, validating the fields it asks for, and assembling the dynamic half
// of a SQL statement.
//
// It knows nothing about any particular type. Each type package declares its
// own field surface and filter table and implements Resolver; the HTTP layer
// only ever sees that interface.
package query

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
)

const (
	defaultLimit = 24
	maxLimit     = 100
	// A page costs one query per fragment, and each returns roughly limit rows
	// times whatever that relation holds. Bounding the product keeps a browse
	// grid working while refusing a full page of detail-page payloads.
	maxFragmentRows = 200
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
	Sort    string
	Reverse bool
	Page    int
	Limit   int
}

// Reserved parameter names; everything else in the query string is a filter.
var reserved = map[string]bool{
	"fields": true, "sort": true, "reverse": true, "page": true, "limit": true,
}

func Parse(reg Registry, r *http.Request) (*Request, error) {
	values := r.URL.Query()
	fields, err := ParseFields(reg, values.Get("fields"))
	if err != nil {
		return nil, err
	}

	req := &Request{
		Fields:  fields,
		Filters: map[string]string{},
		Sort:    values.Get("sort"),
		Reverse: values.Get("reverse") == "true",
		Page:    1,
		Limit:   defaultLimit,
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
		if n > maxLimit {
			return nil, BadRequest("limit may not exceed %d", maxLimit)
		}
		req.Limit = n
	}
	if fragments := len(req.Fields.Fragments); fragments > 0 && req.Limit*fragments > maxFragmentRows {
		return nil, BadRequest("limit %d with %d nested fields exceeds what one request may fetch; "+
			"lower the limit or ask for fewer fields", req.Limit, fragments)
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

// ClientError is a request the caller can fix: an unknown field, a malformed
// id, a filter that does not exist. It reaches the client verbatim as a 400,
// unlike an internal failure, which is logged and reported as a bare 500.
type ClientError struct{ msg string }

func (e *ClientError) Error() string { return e.msg }

func BadRequest(format string, args ...any) error {
	return &ClientError{msg: fmt.Sprintf(format, args...)}
}

func IsClientError(err error) bool {
	var ce *ClientError
	return errors.As(err, &ce)
}
