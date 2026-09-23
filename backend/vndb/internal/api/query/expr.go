package query

import (
	"strings"
	"unicode"
)

// The f= condition expression, combining the same filters the plain
// parameters use:
//
//	f=(lang=en+freeware=true),(lang=ja+has_anime=true)
//	f=!patch=true+platform=win
//
//	,  or    lowest precedence
//	+  and
//	!  not   highest
//	() grouping
//
// lang=en,fr keeps its meaning: two leaves joined by or. A value containing a
// comma, bracket or space is double-quoted; \" and \\ escape inside quotes.
// Leaves are handed to the type's own filter table, so any filter works here.

type node interface {
	compile(b *Builder, filters map[string]FilterFunc) (string, error)
}

type leaf struct {
	name  string
	op    string
	value string
}

type junction struct {
	and      bool // otherwise or
	children []node
}

type negation struct{ inner node }

/* --- Parsing --------------------------------------------------------------- */

// ParseExpr reads an expression, or returns nil when there is none. budget is
// the conditions left to spend (nil: no ceiling); one request shares one, so
// nesting cannot multiply it. maxExprDepth guards the stack when there is no
// budget.
func ParseExpr(text string, budget *int) (node, error) {
	if strings.TrimSpace(text) == "" {
		return nil, nil
	}
	p := &parser{in: []rune(text), budget: budget}
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
	budget *int
}

// Budget returns a request's condition counter, or nil for no ceiling.
func Budget(nodes int) *int {
	if nodes <= 0 {
		return nil
	}
	n := nodes
	return &n
}

func (p *parser) spend() error {
	if p.budget == nil {
		return nil
	}
	if *p.budget == 0 {
		return BadRequest("filter: too many conditions")
	}
	*p.budget--
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

// value reads a bare, quoted or bracketed value. A bracketed one is a condition
// about a related type, release=(lang=en), and is returned whole for that
// relation's filter to parse.
func (p *parser) value() (string, error) {
	p.skipSpace()
	if p.at < len(p.in) && p.in[p.at] == '(' {
		start := p.at
		depth := 0
		quoted := false
		for p.at < len(p.in) {
			c := p.in[p.at]
			switch {
			case quoted && c == '\\':
				p.at++ // skip the escaped character
			case c == '"':
				quoted = !quoted
			case !quoted && c == '(':
				depth++
			case !quoted && c == ')':
				depth--
			}
			p.at++
			if depth == 0 {
				return string(p.in[start:p.at]), nil
			}
		}
		return "", BadRequest("filter: a bracket was opened and not closed")
	}
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

/* --- Compiling ------------------------------------------------------------- */

// Expr compiles an expression and adds it as a single condition.
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
	// id skips paging entirely, so it cannot be one condition among others.
	if l.name == idFilter {
		return "", BadRequest("id is a parameter of its own, not a condition; put it outside the expression")
	}
	apply, ok := filters[l.name]
	if !ok {
		return "", BadRequest("unknown filter %q", l.name)
	}

	// != is the = condition negated, so every filter supports it.
	value := l.value
	if l.op != "=" && l.op != "!=" {
		value = l.op + value
	}

	sub := b.sub()
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
