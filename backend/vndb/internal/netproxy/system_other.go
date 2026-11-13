//go:build !windows

package netproxy

func systemProxy() (server, override string, ok bool) { return "", "", false }
