package query

import "strings"

// Conversions from how the dump stores a value to how the API reports it.

// PreferLatin reports the romanised form when the dump has one: vndb keeps the
// original script in the main column and the transliteration beside it.
func PreferLatin(name string, latin *string) string {
	if latin != nil {
		return *latin
	}
	return name
}

// OriginalOf is the other half: the original script, only when it differs.
func OriginalOf(name string, latin *string) *string {
	if latin == nil {
		return nil
	}
	return &name
}

// SplitLines expands a newline-separated column, which is how the dump stores
// short lists such as aliases.
func SplitLines(value string) []string {
	out := []string{}
	for _, line := range strings.Split(value, "\n") {
		if line = strings.TrimSpace(line); line != "" {
			out = append(out, line)
		}
	}
	return out
}

// EmptyToNil reports an absent text column as null rather than "".
func EmptyToNil(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

// ContentLevel rescales a stored average to the 0-2 range the API reports.
// The dump leaves 200 there when nobody voted, which means unknown rather than
// explicit, so an unvoted image reports null.
func ContentLevel(avg, votes int16) *float64 {
	if votes == 0 {
		return nil
	}
	v := float64(avg) / 100
	return &v
}

// OrEmpty keeps a fragment that found nothing as an empty list, never null.
func OrEmpty[T any](v []T) []T {
	if v == nil {
		return []T{}
	}
	return v
}
