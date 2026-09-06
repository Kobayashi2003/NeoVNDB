package query

import "strings"

// Conversions from how the dump stores a value to how the API reports it.
// Every type package needed the same handful, so they live here rather than
// four times over.

// PreferLatin reports the romanised form when the dump has one. vndb keeps the
// original script in the main column and the transliteration beside it; a
// client that wants the original asks for it by name.
func PreferLatin(name string, latin *string) string {
	if latin != nil {
		return *latin
	}
	return name
}

// OriginalOf is the other half of PreferLatin: the native-script form, present
// only when it differs from what PreferLatin returned.
func OriginalOf(name string, latin *string) *string {
	if latin == nil {
		return nil
	}
	return &name
}

// SplitLines expands a newline-separated column, which is how the dump stores
// short lists such as producer aliases.
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

// ContentLevel rescales a stored sexual/violence average to the 0-2 range the
// API reports. The dump keeps it as the average times a hundred and leaves 200
// there when nobody voted, which means unknown rather than explicit, so an
// unvoted image reports null.
func ContentLevel(avg, votes int16) *float64 {
	if votes == 0 {
		return nil
	}
	v := float64(avg) / 100
	return &v
}

// OrEmpty keeps a fragment that found nothing as an empty list, never null, so
// a client can iterate without checking.
func OrEmpty[T any](v []T) []T {
	if v == nil {
		return []T{}
	}
	return v
}
