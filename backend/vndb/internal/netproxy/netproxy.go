// Package netproxy picks the proxy for outbound requests: HTTPS_PROXY /
// HTTP_PROXY, else the proxy Windows is set to use (which Clash switches),
// else none. Go's own lookup stops at the environment, so a mirror started by a
// launcher or the gateway, with no proxy variables, would otherwise go direct.
package netproxy

import (
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

// Proxy is an http.Transport Proxy function.
func Proxy(req *http.Request) (*url.URL, error) {
	host := req.URL.Hostname()
	if direct(host) {
		return nil, nil
	}
	// Once the environment names a proxy it decides, NO_PROXY included.
	if envSet() {
		return http.ProxyFromEnvironment(req)
	}
	// NO_PROXY set alone still names hosts to reach directly; it does not turn
	// the system proxy off.
	server, override, ok := systemProxy()
	if !ok || bypassed(host, override) || noProxy(host, os.Getenv("NO_PROXY")+","+os.Getenv("no_proxy")) {
		return nil, nil
	}
	return pick(server, req.URL.Scheme), nil
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

func envSet() bool {
	for _, name := range []string{"HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"} {
		if os.Getenv(name) != "" {
			return true
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
