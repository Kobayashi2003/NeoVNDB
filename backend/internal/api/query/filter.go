package query

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/kobayashi/neovndb/internal/vndb"
)

// The dynamic half of the query layer. Browse accepts around twenty-five
// optional filters landing on a dozen tables, so the combinations cannot be
// written out as static SQL the way the fragment loaders are.
//
// Every relation filter compiles to its own EXISTS clause rather than a join.
// A join would multiply rows when a VN matches several tags and would then
// need DISTINCT, which breaks both the count and the ordering; independent
// EXISTS clauses compose with plain AND and leave the row set alone.

// builder accumulates conditions and their arguments in order.
type Builder struct {
	Conds []string
	Args  []any
}

// arg records a value and returns its placeholder.
func (b *Builder) Arg(v any) string {
	b.Args = append(b.Args, v)
	return "$" + strconv.Itoa(len(b.Args))
}

func (b *Builder) Where(format string, args ...any) {
	placeholders := make([]any, len(args))
	for i, a := range args {
		placeholders[i] = b.Arg(a)
	}
	b.Conds = append(b.Conds, fmt.Sprintf(format, placeholders...))
}

// anyOf ORs one condition across a comma-separated value, which is how a
// filter expresses alternatives: platform=win,ios.
func (b *Builder) AnyOf(value string, one func(*Builder, string) error) error {
	parts := SplitValues(value)
	if len(parts) == 0 {
		return BadRequest("empty filter value")
	}
	if len(parts) == 1 {
		return one(b, parts[0])
	}

	var alternatives []string
	for _, p := range parts {
		sub := &Builder{Args: b.Args}
		if err := one(sub, p); err != nil {
			return err
		}
		if len(sub.Conds) != 1 {
			return BadRequest("this filter does not accept a list")
		}
		alternatives = append(alternatives, sub.Conds[0])
		b.Args = sub.Args
	}
	b.Conds = append(b.Conds, "("+strings.Join(alternatives, " OR ")+")")
	return nil
}

func (b *Builder) SQL() string {
	if len(b.Conds) == 0 {
		return "TRUE"
	}
	return strings.Join(b.Conds, " AND ")
}

// filterFunc turns one parameter value into conditions on the builder.
type FilterFunc func(b *Builder, value string) error

// comparison splits a leading operator off a value: rating=>=80 means the
// column is compared with >=, not equality.
var comparisons = []string{">=", "<=", "!=", ">", "<", "="}

func SplitComparison(value string) (op, rest string) {
	for _, c := range comparisons {
		if strings.HasPrefix(value, c) {
			return c, strings.TrimSpace(value[len(c):])
		}
	}
	return "=", strings.TrimSpace(value)
}

func SplitValues(value string) []string {
	var out []string
	for _, p := range strings.Split(value, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// intColumn compares a numeric column, honouring a leading operator.
func IntColumn(column string, scale int) FilterFunc {
	return func(b *Builder, value string) error {
		return b.AnyOf(value, func(b *Builder, v string) error {
			op, rest := SplitComparison(v)
			n, err := strconv.Atoi(rest)
			if err != nil {
				return BadRequest("%q is not a number", rest)
			}
			b.Where(column+" "+op+" %s", n*scale)
			return nil
		})
	}
}

// textColumn compares a text column for equality.
func TextColumn(column string) FilterFunc {
	return func(b *Builder, value string) error {
		return b.AnyOf(value, func(b *Builder, v string) error {
			b.Where(column+" = %s", v)
			return nil
		})
	}
}

// arrayColumn matches one value inside a text[] column.
func ArrayColumn(column string) FilterFunc {
	return func(b *Builder, value string) error {
		return b.AnyOf(value, func(b *Builder, v string) error {
			b.Where("%s = ANY("+column+")", v)
			return nil
		})
	}
}

// boolFilter answers a has_* style parameter.
func BoolFilter(whenTrue, whenFalse string) FilterFunc {
	return func(b *Builder, value string) error {
		switch strings.ToLower(value) {
		case "true", "1":
			b.Conds = append(b.Conds, whenTrue)
		case "false", "0":
			b.Conds = append(b.Conds, whenFalse)
		default:
			return BadRequest("%q is not true or false", value)
		}
		return nil
	}
}

// relatedID matches ids of another entity through an EXISTS clause. The
// template takes one placeholder for the id.
func RelatedID(entity, template string) FilterFunc {
	return func(b *Builder, value string) error {
		return b.AnyOf(value, func(b *Builder, v string) error {
			id, err := vndb.ParseID(entity, v)
			if err != nil {
				return BadRequest("%v", err)
			}
			b.Where(template, id)
			return nil
		})
	}
}
