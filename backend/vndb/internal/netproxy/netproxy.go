// Package netproxy picks the proxy for outbound requests, by the rule in
// D:\Program\Code\AGENTS.md: the first of HTTPS_PROXY and HTTP_PROXY that is
// set, else the proxy Windows is set to use (which Clash switches), else
// none; loopback and private addresses, the hosts NO_PROXY names and those in
// the Windows bypass list always go direct. Not Go's ProxyFromEnvironment: it
// stops at the environment, so a mirror started by a launcher or the gateway
// would go direct, and it gives an https request HTTPS_PROXY alone, so one
// with only HTTP_PROXY set went direct too.
package netproxy

import (
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"path"
	"strings"
)

// Install makes http.DefaultTransport, and every client built on it or cloned
// from it afterwards, use Proxy.
func Install() {
	if t, ok := http.DefaultTransport.(*http.Transport); ok {
		t.Proxy = Proxy
	}
}

// Proxy is an http.Transport Proxy function. The system settings are read
// on every request, so switching Clash takes effect without a restart.
func Proxy(req *http.Request) (*url.URL, error) {
	return choose(req.URL.Hostname(), req.URL.Scheme, os.Getenv, systemProxy())
}

// choose is Proxy with its sources passed in, so the rule is tested apart
// from this machine's environment and registry.
func choose(host, scheme string, getenv func(string) string, sys system) (*url.URL, error) {
	// NO_PROXY set alone names hosts to reach directly; it does not turn the
	// system proxy off. The bypass list holds whichever proxy is in use.
	if direct(host) || noProxy(host, getenv("NO_PROXY")+","+getenv("no_proxy")) || bypassed(host, sys.override) {
		return nil, nil
	}
	for _, name := range []string{"HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"} {
		if v := strings.TrimSpace(getenv(name)); v != "" {
			u := parse(v, "http")
			if u == nil {
				return nil, fmt.Errorf("%s is not a proxy address: %q", name, v)
			}
			return u, nil
		}
	}
	if !sys.on {
		return nil, nil
	}
	return pick(sys.server, scheme), nil
}

// system is the proxy Windows is set to use: on or off, its server, and the
// hosts it bypasses (which apply even while it is off).
type system struct {
	on       bool
	server   string
	override string
}

// noProxy applies a NO_PROXY list as Go's environment lookup reads one:
// comma-separated, "*" for everything, a name matching itself and its
// subdomains (a leading dot or not), an IP or a CIDR range.
func noProxy(host, list string) bool {
	host = strings.ToLower(host)
	ip := net.ParseIP(host)
	for entry := range strings.SplitSeq(strings.ToLower(list), ",") {
		entry = strings.TrimSpace(entry)
		if h, _, err := net.SplitHostPort(entry); err == nil {
			entry = h
		}
		switch {
		case entry == "":
		case entry == "*":
			return true
		case ip != nil && strings.Contains(entry, "/"):
			if _, cidr, err := net.ParseCIDR(entry); err == nil && cidr.Contains(ip) {
				return true
			}
		case ip != nil:
			if e := net.ParseIP(entry); e != nil && e.Equal(ip) {
				return true
			}
		default:
			name := strings.TrimPrefix(entry, ".")
			if host == name || strings.HasSuffix(host, "."+name) {
				return true
			}
		}
	}
	return false
}

// direct reports loopback and private addresses, which never go through a proxy.
func direct(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && (ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast())
}

// pick reads Windows' ProxyServer value: either "host:port" for every scheme or
// "http=host:port;https=host:port;socks=host:port".
func pick(server, scheme string) *url.URL {
	byScheme := map[string]string{}
	for part := range strings.SplitSeq(server, ";") {
		if name, addr, found := strings.Cut(part, "="); found {
			byScheme[strings.ToLower(strings.TrimSpace(name))] = strings.TrimSpace(addr)
		} else if part = strings.TrimSpace(part); part != "" {
			return parse(part, "http")
		}
	}
	for _, name := range []string{scheme, "http"} {
		if addr := byScheme[name]; addr != "" {
			return parse(addr, "http")
		}
	}
	if addr := byScheme["socks"]; addr != "" {
		return parse(addr, "socks5")
	}
	return nil
}

func parse(addr, scheme string) *url.URL {
	if !strings.Contains(addr, "://") {
		addr = scheme + "://" + addr
	}
	u, err := url.Parse(addr)
	if err != nil {
		return nil
	}
	return u
}

// bypassed applies Windows' ProxyOverride list: ';'-separated host patterns
// with '*' wildcards, and "<local>" for names without a dot.
func bypassed(host, override string) bool {
	host = strings.ToLower(host)
	for pattern := range strings.SplitSeq(strings.ToLower(override), ";") {
		pattern = strings.TrimSpace(pattern)
		switch {
		case pattern == "":
		case pattern == "<local>":
			if !strings.Contains(host, ".") {
				return true
			}
		default:
			if ok, _ := path.Match(pattern, host); ok {
				return true
			}
		}
	}
	return false
}
