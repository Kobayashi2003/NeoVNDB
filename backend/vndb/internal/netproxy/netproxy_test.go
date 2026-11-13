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
