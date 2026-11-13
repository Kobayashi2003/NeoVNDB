//go:build !windows

package netproxy

func systemProxy() system { return system{} }
