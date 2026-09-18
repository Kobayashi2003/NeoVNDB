package query

// Limits bound work rather than correctness, so they are settings rather than
// constants. Zero turns a ceiling off.
type Limits struct {
	PageSize    int
	MaxPageSize int
	// Looking rows up by id skips paging, so this is that shape's page size.
	MaxIDs        int
	MaxFieldDepth int
	// Estimated field values in a response, not rows.
	MaxCost int
	// Words in one search. Each costs its own index lookup.
	MaxSearchTerms int
}

// DefaultLimits apply when nothing is configured, which is the case in tests.
func DefaultLimits() Limits {
	return Limits{
		PageSize: 24, MaxPageSize: 100, MaxIDs: 1000,
		MaxFieldDepth: 3, MaxCost: 100_000, MaxSearchTerms: 8,
	}
}
