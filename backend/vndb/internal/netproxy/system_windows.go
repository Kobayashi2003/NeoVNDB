//go:build windows

package netproxy

import "golang.org/x/sys/windows/registry"

// systemProxy reads the proxy Windows is set to use. Read on every request, so
// switching Clash on or off takes effect without a restart.
func systemProxy() (server, override string, ok bool) {
	k, err := registry.OpenKey(registry.CURRENT_USER,
		`Software\Microsoft\Windows\CurrentVersion\Internet Settings`, registry.QUERY_VALUE)
	if err != nil {
		return "", "", false
	}
	defer k.Close()
	if on, _, err := k.GetIntegerValue("ProxyEnable"); err != nil || on == 0 {
		return "", "", false
	}
	server, _, err = k.GetStringValue("ProxyServer")
	if err != nil || server == "" {
		return "", "", false
	}
	override, _, _ = k.GetStringValue("ProxyOverride")
	return server, override, true
}
