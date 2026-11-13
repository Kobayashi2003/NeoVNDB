//go:build windows

package netproxy

import "golang.org/x/sys/windows/registry"

// systemProxy reads the proxy Windows is set to use, and the hosts it
// bypasses whether or not it is on.
func systemProxy() system {
	k, err := registry.OpenKey(registry.CURRENT_USER,
		`Software\Microsoft\Windows\CurrentVersion\Internet Settings`, registry.QUERY_VALUE)
	if err != nil {
		return system{}
	}
	defer k.Close()
	var s system
	s.override, _, _ = k.GetStringValue("ProxyOverride")
	s.server, _, _ = k.GetStringValue("ProxyServer")
	on, _, err := k.GetIntegerValue("ProxyEnable")
	s.on = err == nil && on != 0 && s.server != ""
	return s
}
