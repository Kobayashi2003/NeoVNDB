package query

import (
	"strings"
	"unicode"
)

// A condition expression: the same filters the plain parameters use, combined
// with and, or and not.
//
// Two parameters on their own are always ANDed, which is what a reader expects
// of two controls and is all a row of menus can express. It cannot say "in
// English or in Japanese, but only the ones with an anime", and it cannot say
// "not a patch" at all. This can:
//
//	f=(lang=en+freeware=true),(lang=ja+has_anime=true)
//	f=!patch=true+platform=win
//
//	,  or          lowest, so it binds last
//	+  and
//	!  not         highest, and applies to whatever follows it
//	() grouping
//
// The comma keeps the meaning it already had: `lang=en,fr` was one filter with
// two acceptable values and is now two leaves joined by or, which is the same
// question and the same answer.
//
// A value that contains a comma, a bracket or a space goes in double quotes:
// `search="ever out"`. Inside them, \" is a quote and \\ a backslash.
//
// Nothing here knows what any particular filter means. A leaf is handed to the
// type's own filter table, so every filter that works as a parameter works
// here, and one added later works here without being told to.

type node interface {
	// compile writes this node's condition, using the same builder so that
	// every argument lands in one ordered list.
	compile(b *Builder, filters map[string]FilterFunc) (string, error)
}

type leaf struct {
	name  string
	op    string
	value string
}

type junction struct {
	and      bool // and, or else or
	children []node
}

type negation struct{ inner node }

/* --- Reading one ----------------------------------------------------------- */

// ParseExpr reads an expression, or returns nil when there is nothing to read.
//
// `nodes` bounds the work a single request can ask for; 0 lifts it. Depth is
// bounded by the same number, since a tree cannot be deeper than it is large,
// and by a fixed ceiling besides -- that one is not policy but a guard on this
// process's own stack, which an unbounded setting would otherwise hand to
// whoever writes the query string.
func ParseExpr(text string, nodes int) (node, error) {
	if strings.TrimSpace(text) == "" {
		return nil, nil
	}
	p := &parser{in: []rune(text), budget: nodes}
	if p.budget <= 0 {
		p.budget = -1
	}
	n, err := p.expression(0)
	if err != nil {
		return nil, err
	}
	if p.at < len(p.in) {
		return nil, BadRequest("filter: unexpected %q at position %d", string(p.in[p.at]), p.at+1)
	}
	return n, nil
}

const maxExprDepth = 64

type parser struct {
	in     []rune
	at     int
	budget int // nodes left, or -1 for no ceiling
}

func (p *parser) spend() error {
	if p.budget < 0 {
		return nil
	}
	if p.budget == 0 {
		return BadRequest("filter: too many conditions")
	}
	p.budget--
	return nil
}

func (p *parser) skipSpace() {
	for p.at < len(p.in) && unicode.IsSpace(p.in[p.at]) {
		p.at++
	}
}

func (p *parser) peek() rune {
	p.skipSpace()
	if p.at >= len(p.in) {
		return 0
	}
	return p.in[p.at]
}

// expression := term ("," term)*
func (p *parser) expression(depth int) (node, error) {
	if depth > maxExprDepth {
		return nil, BadRequest("filter: nested too deeply")
	}
	first, err := p.term(depth)
	if err != nil {
		return nil, err
	}
	children := []node{first}
	for p.peek() == ',' {
		p.at++
		next, err := p.term(depth)
		if err != nil {
			return nil, err
		}
		children = append(children, next)
	}
	if len(children) == 1 {
		return first, nil
	}
	return &junction{and: false, children: children}, nil
}

// term := factor ("+" factor)*
func (p *parser) term(depth int) (node, error) {
	first, err := p.factor(depth)
	if err != nil {
		return nil, err
	}
	children := []node{first}
	for p.peek() == '+' {
		p.at++
		next, err := p.factor(depth)
		if err != nil {
			return nil, err
		}
		children = append(children, next)
	}
	if len(children) == 1 {
		return first, nil
	}
	return &junction{and: true, children: children}, nil
}

// factor := "!" factor | "(" expression ")" | leaf
func (p *parser) factor(depth int) (node, error) {
	switch p.peek() {
	case 0:
		return nil, BadRequest("filter: ended early, expected a condition")
	case '!':
		p.at++
		inner, err := p.factor(depth + 1)
		if err != nil {
			return nil, err
		}
		return &negation{inner: inner}, nil
	case '(':
		p.at++
		inner, err := p.expression(depth + 1)
		if err != nil {
			return nil, err
		}
		if p.peek() != ')' {
			return nil, BadRequest("filter: a bracket was opened and not closed")
		}
		p.at++
		return inner, nil
	default:
		return p.leaf()
	}
}

// A filter's name: what a parameter may be called, and nothing else, so that
// the reader of an expression can see where the name ends.
func nameRune(r rune) bool {
	return r == '_' || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')
}

func (p *parser) leaf() (node, error) {
	if err := p.spend(); err != nil {
		return nil, err
	}
	p.skipSpace()

	start := p.at
	for p.at < len(p.in) && nameRune(p.in[p.at]) {
		p.at++
	}
	if p.at == start {
		return nil, BadRequest("filter: expected a filter name at position %d", start+1)
	}
	name := string(p.in[start:p.at])

	// `lang = en` is how a person writes it out, so the spaces around an
	// operator are not part of anything.
	p.skipSpace()
	op := ""
	for _, candidate := range comparisons {
		if strings.HasPrefix(string(p.in[p.at:]), candidate) {
			op = candidate
			p.at += len([]rune(candidate))
			break
		}
	}
	if op == "" {
		return nil, BadRequest("filter: %s needs one of = != >= <= > <", name)
	}

	value, err := p.value()
	if err != nil {
		return nil, err
	}
	return &leaf{name: name, op: op, value: value}, nil
}

// A value runs to the next thing that means something to this grammar, or is
// quoted and runs to its closing quote.
func (p *parser) value() (string, error) {
	p.skipSpace()
	if p.at < len(p.in) && p.in[p.at] == '"' {
		p.at++
		var out strings.Builder
		for p.at < len(p.in) {
			switch c := p.in[p.at]; c {
			case '\\':
				if p.at+1 < len(p.in) {
					p.at++
					out.WriteRune(p.in[p.at])
					p.at++
					continue
				}
				return "", BadRequest("filter: a value ends with a lone backslash")
			case '"':
				p.at++
				return out.String(), nil
			default:
				out.WriteRune(c)
				p.at++
			}
		}
		return "", BadRequest("filter: a quoted value was not closed")
	}

	start := p.at
	for p.at < len(p.in) && !strings.ContainsRune(",+()", p.in[p.at]) {
		p.at++
	}
	value := strings.TrimSpace(string(p.in[start:p.at]))
	if value == "" {
		return "", BadRequest("filter: a condition at position %d has no value", start+1)
	}
	return value, nil
}

/* --- Turning one into SQL -------------------------------------------------- */

// Expr compiles an expression against one type's filters and adds it as a
// single condition.
func (b *Builder) Expr(n node, filters map[string]FilterFunc) error {
	if n == nil {
		return nil
	}
	cond, err := n.compile(b, filters)
	if err != nil {
		return err
	}
	b.Conds = append(b.Conds, cond)
	return nil
}

func (l *leaf) compile(b *Builder, filters map[string]FilterFunc) (string, error) {
	// Looking rows up by id is not a condition among others: it skips paging
	// entirely, because the caller asked for particular rows rather than for a
	// slice of them. Answering it here would quietly mean something else than
	// the parameter of the same name does.
	if l.name == idFilter {
		return "", BadRequest("id is a parameter of its own, not a condition; put it outside the expression")
	}
	apply, ok := filters[l.name]
	if !ok {
		return "", BadRequest("unknown filter %q", l.name)
	}

	// Not-equal is the same question asked of the same filter, and then
	// refused; every filter therefore supports it without knowing it does.
	value := l.value
	if l.op != "=" && l.op != "!=" {
		value = l.op + value
	}

	// A sub-builder so the filter's conditions can be picked up and combined,
	// rather than landing in the AND-list at the top. Arguments are threaded
	// through so their numbering stays in step.
	sub := &Builder{Args: b.Args, Limits: b.Limits}
	if err := apply(sub, value); err != nil {
		return "", err
	}
	b.Args = sub.Args
	if len(sub.Conds) == 0 {
		return "", BadRequest("filter %q matched nothing to test", l.name)
	}

	cond := strings.Join(sub.Conds, " AND ")
	if len(sub.Conds) > 1 {
		cond = "(" + cond + ")"
	}
	if l.op == "!=" {
		cond = "NOT (" + cond + ")"
	}
	return cond, nil
}

func (j *junction) compile(b *Builder, filters map[string]FilterFunc) (string, error) {
	parts := make([]string, 0, len(j.children))
	for _, child := range j.children {
		cond, err := child.compile(b, filters)
		if err != nil {
			return "", err
		}
		parts = append(parts, cond)
	}
	join := " OR "
	if j.and {
		join = " AND "
	}
	return "(" + strings.Join(parts, join) + ")", nil
}

func (n *negation) compile(b *Builder, filters map[string]FilterFunc) (string, error) {
	cond, err := n.inner.compile(b, filters)
	if err != nil {
		return "", err
	}
	return "NOT (" + cond + ")", nil
}
