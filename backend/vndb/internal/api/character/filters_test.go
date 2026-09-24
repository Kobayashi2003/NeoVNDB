package character

import (
	"reflect"
	"testing"

	"github.com/kobayashi/neovndb/internal/api/query"
)

func TestBirthdayFilter(t *testing.T) {
	cases := []struct {
		in   string
		want string
		args []any
	}{
		{"12-25", "c.birthday = $1", []any{1225}},
		{"3", "c.birthday BETWEEN $1 AND $2", []any{301, 331}},
	}
	for _, c := range cases {
		b := &query.Builder{}
		if err := filters["birthday"](b, c.in); err != nil {
			t.Fatalf("%q: %v", c.in, err)
		}
		if b.SQL() != c.want || !reflect.DeepEqual(b.Args, c.args) {
			t.Errorf("%q: got %s %v", c.in, b.SQL(), b.Args)
		}
	}
	for _, bad := range []string{"13", "0-1", "12-32", "dec", "12-"} {
		if err := filters["birthday"](&query.Builder{}, bad); err == nil {
			t.Errorf("%q: want an error", bad)
		}
	}
}
