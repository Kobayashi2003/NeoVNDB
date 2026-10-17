package query

// Limits bound work rather than correctness, so they are settings rather than
// constants. Zero turns a ceiling off.
type Limits struct {
	PageSize    int
	MaxPageSize int
	// A lookup by id skips paging; this is its page size.
	MaxIDs        int
	MaxFieldDepth int
	// Estimated field values in a response, not rows.
	MaxCost        int
	MaxSearchTerms int
	// Conditions per request, nested ones included.
	MaxFilterNodes int
}

// DefaultLimits apply when nothing is configured, which is the case in tests.
func DefaultLimits() Limits {
	return Limits{
		PageSize: 24, MaxPageSize: 100, MaxIDs: 1000,
		MaxFieldDepth: 4, MaxCost: 100_000, MaxSearchTerms: 8, MaxFilterNodes: 64,
	}
}
