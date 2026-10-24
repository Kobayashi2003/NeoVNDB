package query

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/kobayashi/neovndb/internal/vndb"
)

// Relation filters compile to independent EXISTS clauses rather than joins: a
// join multiplies rows when a VN matches several tags and would need DISTINCT,
// which breaks both the count and the ordering.

type Builder struct {
	Conds []string
	Args  []any
	// Limits a filter may need to apply its own ceiling.
	Limits Limits
	// For conditions about a related type: the types, and the conditions still
	// left to spend across the whole request.
	Types  *Catalog
	Budget *int
}

// Arg records a value and returns its placeholder.
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

// AnyOf ORs one condition across a comma-separated value: platform=win,ios.
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
		sub := b.sub()
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

// sub is a builder whose conditions can be combined rather than ANDed. Args are
// shared so placeholder numbering stays in step.
func (b *Builder) sub() *Builder {
	return &Builder{Args: b.Args, Limits: b.Limits, Types: b.Types, Budget: b.Budget}
}

func (b *Builder) SQL() string {
	if len(b.Conds) == 0 {
		return "TRUE"
	}
	return strings.Join(b.Conds, " AND ")
}

type FilterFunc func(b *Builder, value string) error

// A leading operator on a value: rating=>=80.
var comparisons = []string{">=", "<=", "!=", ">", "<", "="}

func SplitComparison(value string) (op, rest string) {
	for _, c := range comparisons {
		if strings.HasPrefix(value, c) {
			return c, strings.TrimSpace(value[len(c):])
		}
	}
	return "=", strings.TrimSpace(value)
}

// matchOnly refuses an operator on a filter that only tests equality. Without
// it, lang>=en searched for a language called ">=en" and silently found none.
func matchOnly(value string) (string, error) {
	op, rest := SplitComparison(value)
	if op != "=" {
		return "", BadRequest("this filter matches rather than compares, so %q means nothing to it", op)
	}
	return rest, nil
}

// Match is how every equality filter is built, so the list form and the
// operator refusal cannot be left out. Comparing filters use SplitComparison.
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

// ReleasedColumn compares a YYYYMMDD date column, reading a whole year or
// month as the range it covers, so browsing by date is a range scan.
func ReleasedColumn(column string) FilterFunc {
	return func(b *Builder, value string) error {
		return b.AnyOf(value, func(b *Builder, v string) error {
			op, rest := SplitComparison(v)
			low, high, err := vndb.ParseReleasedRange(rest)
			if err != nil {
				return BadRequest("%v", err)
			}
			switch op {
			case "=":
				b.Where(column+" BETWEEN %s AND %s", low, high)
			case "!=":
				b.Where(column+" NOT BETWEEN %s AND %s", low, high)
			case ">":
				b.Where(column+" > %s", high)
			case ">=":
				b.Where(column+" >= %s", low)
			case "<":
				b.Where(column+" < %s", low)
			case "<=":
				b.Where(column+" <= %s", high)
			}
			return nil
		})
	}
}

func TextColumn(column string) FilterFunc {
	return Match(func(b *Builder, v string) error {
		b.Where(column+" = %s", v)
		return nil
	})
}

// ArrayColumn matches one value inside a text[] column.
func ArrayColumn(column string) FilterFunc {
	return Match(func(b *Builder, v string) error {
		b.Where("%s = ANY("+column+")", v)
		return nil
	})
}

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

// Related matches a tag or trait through its join table, optionally with a
// minimum score and a spoiler ceiling:
//
//	tag=g749          any score, any spoiler
//	tag=g749:2.0      score at least 2.0
//	tag=g749:2.0:1    and spoiler at most 1
//	trait=i568:1      traits have no score, so the one number is the spoiler
//	tag=(search=school+category=cont)   any tag matching the tag filters
//
// Unasked, neither condition reaches the SQL, so the plain form is unchanged.
// The bracketed form has no score or spoiler: it asks about the tags
// themselves, as Relation does about its type.
type Related struct {
	Entity string
	From   string
	Owner  string
	ID     string
	// Score is empty where the relation has none.
	Score   string
	Spoiler string
	// Join brings the tag or trait row in under its filters' alias, for the
	// bracketed form.
	Join string
}

func (r Related) Filter() FilterFunc {
	byID := r.byID()
	return func(b *Builder, value string) error {
		inner, nested, err := bracketed(value)
		switch {
		case err != nil:
			return err
		case !nested:
			return byID(b, value)
		case r.Join == "":
			return BadRequest("%s here takes an id, not conditions", r.Entity)
		}
		cond, err := b.nested(r.Entity, inner)
		if err != nil {
			return err
		}
		b.Conds = append(b.Conds,
			"EXISTS (SELECT 1 FROM "+r.From+" JOIN "+r.Join+" WHERE "+r.Owner+" AND "+cond+")")
		return nil
	}
}

func (r Related) byID() FilterFunc {
	return Match(func(b *Builder, v string) error {
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
	})
}

// Relation is a link that can be matched by id or by a condition on the
// related type:
//
//	release=r1234                      this release
//	release=(lang=en+freeware=true)    one release that is both
//
// The bracketed form is the point: two separate parameters can be satisfied by
// two different releases. The inner conditions are the related type's own
// filters, looked up at compile time.
//
// Nesting the same type twice reuses its alias; SQL scoping makes the inner one
// win, which is right as long as no filter reaches for an outer row.
type Relation struct {
	// Type is both what an id is parsed as and whose filters apply inside.
	Type  string
	From  string
	Owner string
	ID    string
	// Join brings the related row in under its filters' alias; empty when From
	// already has it.
	Join string
}

func (rel Relation) Filter() FilterFunc {
	return func(b *Builder, value string) error {
		inner, nested, err := bracketed(value)
		if err != nil {
			return err
		}
		if !nested {
			return Match(func(b *Builder, v string) error {
				id, err := vndb.ParseID(rel.Type, v)
				if err != nil {
					return BadRequest("%v", err)
				}
				b.Where("EXISTS (SELECT 1 FROM "+rel.From+
					" WHERE "+rel.Owner+" AND "+rel.ID+" = %s)", id)
				return nil
			})(b, value)
		}

		cond, err := b.nested(rel.Type, inner)
		if err != nil {
			return err
		}

		from := rel.From
		if rel.Join != "" {
			from += " JOIN " + rel.Join
		}
		b.Conds = append(b.Conds,
			"EXISTS (SELECT 1 FROM "+from+" WHERE "+rel.Owner+" AND "+cond+")")
		return nil
	}
}

// bracketed reports whether a value is a (condition) rather than an id, and
// returns what is inside. A plain parameter arrives unparsed, so its brackets
// are checked here.
func bracketed(value string) (inner string, nested bool, err error) {
	trimmed := strings.TrimSpace(value)
	if !strings.HasPrefix(trimmed, "(") {
		return "", false, nil
	}
	if !strings.HasSuffix(trimmed, ")") {
		return "", false, BadRequest("filter: a bracket was opened and not closed")
	}
	return trimmed[1 : len(trimmed)-1], true, nil
}

// nested compiles a condition written about another type with that type's
// own filters, keeping placeholder numbering in step with b.
func (b *Builder) nested(typ, inner string) (string, error) {
	if b.Types == nil {
		return "", BadRequest("conditions about a related type are not available here")
	}
	target := b.Types.Get(typ)
	if target == nil {
		return "", BadRequest("nothing is known about %s", typ)
	}
	expr, err := ParseExpr(inner, b.Budget)
	if err != nil {
		return "", err
	}
	if expr == nil {
		return "", BadRequest("%s needs a condition between its brackets", typ)
	}
	sub := b.sub()
	cond, err := expr.compile(sub, target.Filters())
	if err != nil {
		return "", err
	}
	b.Args = sub.Args
	return cond, nil
}

// RelatedID matches another entity by id; the template takes one placeholder.
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

// ExtLinkFilter matches an entry with a link to a site: extlink=steam. table
// is the entry's link table (vn_extlinks...), owner the column it joins on.
func ExtLinkFilter(table, owner string) FilterFunc {
	return Match(func(b *Builder, v string) error {
		// An unknown site would match nothing and look like an empty result.
		if !vndb.KnownSite(v) {
			return BadRequest("unknown link site %q", v)
		}
		b.Where(`EXISTS (SELECT 1 FROM `+table+` x JOIN extlinks e ON e.id = x.link
		          WHERE x.id = `+owner+` AND e.site = %s)`, v)
		return nil
	})
}
