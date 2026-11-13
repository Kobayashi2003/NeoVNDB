package netproxy

import "testing"

func TestDirect(t *testing.T) {
	for host, want := range map[string]bool{
		"localhost": true, "127.0.0.1": true, "::1": true, "192.168.0.168": true,
		"10.1.2.3": true, "172.20.0.1": true, "172.32.0.1": false, "vndb.org": false,
	} {
		if got := direct(host); got != want {
			t.Errorf("direct(%q) = %v, want %v", host, got, want)
		}
	}
}

func TestPick(t *testing.T) {
	for _, c := range []struct{ server, scheme, want string }{
		{"127.0.0.1:7890", "https", "http://127.0.0.1:7890"},
		{"http=127.0.0.1:1;https=127.0.0.1:2", "https", "http://127.0.0.1:2"},
		{"http=127.0.0.1:1", "https", "http://127.0.0.1:1"},
		{"socks=127.0.0.1:3", "https", "socks5://127.0.0.1:3"},
	} {
		got := pick(c.server, c.scheme)
		if got == nil || got.String() != c.want {
			t.Errorf("pick(%q, %q) = %v, want %s", c.server, c.scheme, got, c.want)
		}
	}
}

// The whole rule: the first of HTTPS_PROXY and HTTP_PROXY for every scheme,
// else the system proxy, else none; what is local, in NO_PROXY or in the
// bypass list goes direct whichever proxy is in use.
func TestChoose(t *testing.T) {
	clash := system{on: true, server: "127.0.0.1:7890", override: "*.lan;<local>"}
	off := system{override: "*.lan"}
	for _, c := range []struct {
		name, host, scheme string
		env                map[string]string
		sys                system
		want               string
	}{
		{"https with only HTTP_PROXY", "dl.vndb.org", "https", map[string]string{"HTTP_PROXY": "http://10.0.0.9:3128"}, off, "http://10.0.0.9:3128"},
		{"HTTPS_PROXY first", "dl.vndb.org", "http", map[string]string{"HTTPS_PROXY": "proxy.test:1", "HTTP_PROXY": "proxy.test:2"}, off, "http://proxy.test:1"},
		{"the environment over the system", "t.vndb.org", "https", map[string]string{"https_proxy": "proxy.test:1"}, clash, "http://proxy.test:1"},
		{"the system when the environment is silent", "t.vndb.org", "https", nil, clash, "http://127.0.0.1:7890"},
		{"NO_PROXY alone keeps the system proxy for the rest", "t.vndb.org", "https", map[string]string{"NO_PROXY": "example.com"}, clash, "http://127.0.0.1:7890"},
		{"NO_PROXY over the environment's proxy", "a.example.com", "https", map[string]string{"HTTPS_PROXY": "proxy.test:1", "NO_PROXY": "example.com"}, off, ""},
		{"the bypass list over the environment's proxy", "nas.lan", "http", map[string]string{"HTTP_PROXY": "proxy.test:1"}, off, ""},
		{"the bypass list over the system proxy", "nas", "http", nil, clash, ""},
		{"a private address", "192.168.1.5", "http", map[string]string{"HTTP_PROXY": "proxy.test:1"}, clash, ""},
		{"nothing set", "dl.vndb.org", "https", nil, off, ""},
	} {
		got, err := choose(c.host, c.scheme, func(k string) string { return c.env[k] }, c.sys)
		s := ""
		if got != nil {
			s = got.String()
		}
		if err != nil || s != c.want {
			t.Errorf("%s: %q, %v; want %q", c.name, s, err, c.want)
		}
	}
	if _, err := choose("dl.vndb.org", "https", func(k string) string {
		return map[string]string{"HTTPS_PROXY": "http://[::1"}[k]
	}, off); err == nil {
		t.Error("an unreadable HTTPS_PROXY went direct without a word")
	}
}

// NO_PROXY alone still bypasses the system proxy for what it names.
func TestNoProxy(t *testing.T) {
	list := "example.com, .test.org,10.0.0.0/8 ,203.0.113.7,host:8080"
	for host, want := range map[string]bool{
		"example.com": true, "a.example.com": true, "notexample.com": false,
		"x.test.org": true, "test.org": true, "10.9.8.7": true,
		"203.0.113.7": true, "203.0.113.8": false, "host": true, "vndb.org": false,
	} {
		if got := noProxy(host, list); got != want {
			t.Errorf("noProxy(%q) = %v, want %v", host, got, want)
		}
	}
	if !noProxy("anything", "*") || noProxy("vndb.org", "") {
		t.Error("* matches everything and an empty list nothing")
	}
}

func TestBypassed(t *testing.T) {
	override := "localhost;127.*;192.168.*;*.example.com;<local>"
	for host, want := range map[string]bool{
		"192.168.1.5": true, "a.example.com": true, "nas": true,
		"vndb.org": false, "example.com": false,
	} {
		if got := bypassed(host, override); got != want {
			t.Errorf("bypassed(%q) = %v, want %v", host, got, want)
		}
	}
}
