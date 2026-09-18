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
	// The bounds this request was validated against, for the filters that
	// have one of their own to apply.
	Limits Limits
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
		sub := &Builder{Args: b.Args, Limits: b.Limits}
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

// matchOnly is for the filters that compare a value with nothing but equality.
// Handed ">=en" they would have looked for a language called ">=en" and found
// none, which reads as "no results" rather than as the mistake it is -- and an
// expression makes that mistake easy to write, since every leaf carries an
// operator whether or not its filter has any use for one.
func matchOnly(value string) (string, error) {
	op, rest := SplitComparison(value)
	if op != "=" {
		return "", BadRequest("this filter matches rather than compares, so %q means nothing to it", op)
	}
	return rest, nil
}

// Match builds a filter from a condition on one value: the list form and the
// refusal above both come with it.
//
// This is the idiom for every filter that matches rather than compares, and it
// exists so that the refusal cannot be left out of the next one written. The
// ones that do compare -- a rating, a date, a height -- take the operator
// apart themselves with SplitComparison.
func Match(one func(*Builder, string) error) FilterFunc {
	return func(b *Builder, value string) error {
		return b.AnyOf(value, func(b *Builder, v string) error {
			v, err := matchOnly(v)
			if err != nil {
				return err
			}
			return one(b, v)
		})
	}
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
	return Match(func(b *Builder, v string) error {
		b.Where(column+" = %s", v)
		return nil
	})
}

// arrayColumn matches one value inside a text[] column.
func ArrayColumn(column string) FilterFunc {
	return Match(func(b *Builder, v string) error {
		b.Where("%s = ANY("+column+")", v)
		return nil
	})
}

// boolFilter answers a has_* style parameter.
func BoolFilter(whenTrue, whenFalse string) FilterFunc {
	return func(b *Builder, value string) error {
		value, err := matchOnly(value)
		if err != nil {
			return err
		}
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

// Related matches a tag or a trait through the table that joins it, and lets
// the strength of that join be asked about.
//
// A tag is not simply on or off: every one carries a score from the votes it
// collected and a spoiler level, and "tagged Mystery" means something
// different at 0.4 than at 2.8. Without a way to say so, a filter for a tag
// returns everything anyone ever suggested.
//
//	tag=g749          however weakly, spoilers and all -- what it meant before
//	tag=g749:2.0      scored 2.0 or better
//	tag=g749:2.0:1    and giving away no more than a minor spoiler
//	trait=i568:1      traits carry no score, so one number is the spoiler
//
// Score and spoiler are left off the SQL entirely when they are not asked
// for, so the plain form is the query it always was.
type Related struct {
	Entity string
	// The joining table and its alias, and how it hangs off the row.
	From  string
	Owner string
	// The column holding the id being matched, and the two that qualify it.
	// Score is empty where the relation has none.
	ID      string
	Score   string
	Spoiler string
}

func (r Related) Filter() FilterFunc {
	return Match(func(b *Builder, v string) error {
		{
			parts := strings.Split(v, ":")
			id, err := vndb.ParseID(r.Entity, strings.TrimSpace(parts[0]))
			if err != nil {
				return BadRequest("%v", err)
			}

			where := []string{r.Owner, r.ID + " = " + b.Arg(id)}
			rest := parts[1:]
			if r.Score != "" && len(rest) > 0 {
				score, err := strconv.ParseFloat(strings.TrimSpace(rest[0]), 64)
				if err != nil {
					return BadRequest("%q is not a score", rest[0])
				}
				where = append(where, r.Score+" >= "+b.Arg(score))
				rest = rest[1:]
			}
			if len(rest) > 0 {
				spoiler, err := strconv.Atoi(strings.TrimSpace(rest[0]))
				if err != nil || spoiler < 0 || spoiler > 2 {
					return BadRequest("%q is not a spoiler level; 0, 1 or 2", rest[0])
				}
				where = append(where, r.Spoiler+" <= "+b.Arg(spoiler))
				rest = rest[1:]
			}
			if len(rest) > 0 {
				return BadRequest("%q has more parts than this filter understands", v)
			}

			b.Conds = append(b.Conds,
				"EXISTS (SELECT 1 FROM "+r.From+" WHERE "+strings.Join(where, " AND ")+")")
			return nil
		}
	})
}

// relatedID matches ids of another entity through an EXISTS clause. The
// template takes one placeholder for the id.
func RelatedID(entity, template string) FilterFunc {
	return Match(func(b *Builder, v string) error {
		id, err := vndb.ParseID(entity, v)
		if err != nil {
			return BadRequest("%v", err)
		}
		b.Where(template, id)
		return nil
	})
}
