package vndb

import (
	"fmt"
	"strconv"
	"strings"
)

// The dump encodes a release date as YYYYMMDD, using 99 for a part nobody
// knows and 9999 for a date nobody has announced.
const (
	unknownPart = 99
	noDate      = 9999
	NoRelease   = 0
)

// FormatReleased renders a stored date the way vndb writes it: a full date,
// a month, a year, or "TBA".
func FormatReleased(v int32) string {
	if v == NoRelease {
		return ""
	}
	year, month, day := v/10000, v/100%100, v%100
	switch {
	case year == noDate:
		return "TBA"
	case month == unknownPart:
		return fmt.Sprintf("%04d", year)
	case day == unknownPart:
		return fmt.Sprintf("%04d-%02d", year, month)
	default:
		return fmt.Sprintf("%04d-%02d-%02d", year, month, day)
	}
}

// ParseReleasedRange turns a filter value into the bounds to compare against.
// A partial date covers everything inside it, which is what makes browsing by
// year or month a plain range scan:
//
//	2002       -> 20020000 .. 20029999
//	2002-08    -> 20020800 .. 20020899
//	2002-08-29 -> 20020829 .. 20020829
func ParseReleasedRange(value string) (low, high int32, err error) {
	value = strings.TrimSpace(value)
	if strings.EqualFold(value, "tba") {
		return noDate * 10000, noDate*10000 + 9999, nil
	}

	parts := strings.Split(value, "-")
	if len(parts) > 3 {
		return 0, 0, fmt.Errorf("%q is not a date", value)
	}
	nums := make([]int, 3)
	for i, p := range parts {
		n, convErr := strconv.Atoi(p)
		if convErr != nil {
			return 0, 0, fmt.Errorf("%q is not a date", value)
		}
		nums[i] = n
	}

	switch len(parts) {
	case 1:
		return int32(nums[0] * 10000), int32(nums[0]*10000 + 9999), nil
	case 2:
		base := nums[0]*10000 + nums[1]*100
		return int32(base), int32(base + 99), nil
	default:
		exact := int32(nums[0]*10000 + nums[1]*100 + nums[2])
		return exact, exact, nil
	}
}
