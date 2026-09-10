package query

// Limits are the bounds one request is validated against. They bound work
// rather than correctness, so they are settings the deployment supplies
// instead of constants: a private instance serving one frontend can afford
// far more than a public one.
type Limits struct {
	// PageSize is used when the caller names none; MaxPageSize is the ceiling.
	PageSize    int
	MaxPageSize int
	// MaxIDs bounds a comma-separated id list. Looking rows up by id skips
	// paging, so this is the page size for that shape of request.
	MaxIDs int
	// MaxFieldDepth is how far a nested field may reach.
	MaxFieldDepth int
	// MaxCost is the estimated number of field values a response may carry.
	MaxCost int
}

// DefaultLimits are what the package assumes when nothing is configured,
// which is the case in tests.
func DefaultLimits() Limits {
	return Limits{
		PageSize: 24, MaxPageSize: 100, MaxIDs: 100,
		MaxFieldDepth: 3, MaxCost: 100_000,
	}
}
