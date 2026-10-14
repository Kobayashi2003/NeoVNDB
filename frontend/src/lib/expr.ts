/** The f= condition expression as a tree, for the condition builder. Mirrors
 *  backend query/expr.go: `,` or, `+` and, `!` not, `()` grouping, `"..."`
 *  quoting, and a bracketed value as a condition on a related type. */

export type Op = '=' | '!=' | '>=' | '<=' | '>' | '<';

/** Longest first, as the backend matches them. */
const OPS: Op[] = ['>=', '<=', '!=', '>', '<', '='];

export interface Leaf {
  kind: 'leaf';
  key: number;
  name: string;
  op: Op;
  /** A group is a condition on the related type: release=(lang=en). */
  value: string | Group;
}

export interface Group {
  kind: 'group';
  key: number;
  and: boolean;
  not: boolean;
  items: Node[];
}

export type Node = Leaf | Group;

let lastKey = 0;
/** React keys only; never serialised. */
export const nextKey = () => ++lastKey;

export function group(and = true, items: Node[] = [], not = false): Group {
  return { kind: 'group', key: nextKey(), and, not, items };
}

export function leaf(name = '', op: Op = '=', value: string | Group = ''): Leaf {
  return { kind: 'leaf', key: nextKey(), name, op, value };
}

export class ExprError extends Error {
  constructor(
    message: string,
    readonly at: number,
  ) {
    super(message);
    this.name = 'ExprError';
  }
}

/* --- Parsing ---------------------------------------------------------------- */

const MAX_DEPTH = 64;

/** Parses into a root group. Negated leaves are folded into their operator
 *  (!a=1 is a!=1, !a>=1 is a<1), which the backend treats the same. */
export function parse(text: string): Group {
  if (text.trim() === '') return group();
  const p = new Parser(text);
  const node = p.expression(0);
  p.skipSpace();
  if (p.at < p.src.length) throw new ExprError(`Unexpected "${p.src[p.at]}"`, p.at);
  return node.kind === 'group' && !node.not ? node : group(true, [node]);
}

const FLIP: Record<Op, Op> = { '=': '!=', '!=': '=', '>=': '<', '<': '>=', '<=': '>', '>': '<=' };

export function negate(n: Node): Node {
  if (n.kind === 'leaf') return { ...n, op: FLIP[n.op] };
  return { ...n, not: !n.not };
}

class Parser {
  at = 0;
  constructor(readonly src: string) {}

  skipSpace() {
    while (this.at < this.src.length && /\s/.test(this.src[this.at])) this.at++;
  }

  peek(): string {
    this.skipSpace();
    return this.src[this.at] ?? '';
  }

  expression(depth: number): Node {
    if (depth > MAX_DEPTH) throw new ExprError('Nested too deeply', this.at);
    const items = [this.term(depth)];
    while (this.peek() === ',') {
      this.at++;
      items.push(this.term(depth));
    }
    return items.length === 1 ? items[0] : group(false, items);
  }

  term(depth: number): Node {
    const items = [this.factor(depth)];
    while (this.peek() === '+') {
      this.at++;
      items.push(this.factor(depth));
    }
    return items.length === 1 ? items[0] : group(true, items);
  }

  factor(depth: number): Node {
    const c = this.peek();
    if (c === '') throw new ExprError('Ended early; a condition was expected', this.at);
    if (c === '!') {
      this.at++;
      return negate(this.factor(depth + 1));
    }
    if (c === '(') {
      this.at++;
      const inner = this.expression(depth + 1);
      if (this.peek() !== ')') throw new ExprError('A bracket was opened and not closed', this.at);
      this.at++;
      return inner;
    }
    return this.leaf(depth);
  }

  leaf(depth: number): Leaf {
    this.skipSpace();
    const start = this.at;
    while (this.at < this.src.length && /[a-z0-9_]/.test(this.src[this.at])) this.at++;
    if (this.at === start) throw new ExprError('Expected a filter name', start);
    const name = this.src.slice(start, this.at);

    this.skipSpace();
    const op = OPS.find(o => this.src.startsWith(o, this.at));
    if (!op) throw new ExprError(`${name} needs one of = != >= <= > <`, this.at);
    this.at += op.length;

    return leaf(name, op, this.value(depth));
  }

  value(depth: number): string | Group {
    this.skipSpace();
    const start = this.at;
    if (this.src[this.at] === '(') {
      // Same capture as the backend: find the matching bracket, skipping
      // quoted text, then parse the inside as its own expression.
      let level = 0;
      let quoted = false;
      while (this.at < this.src.length) {
        const c = this.src[this.at];
        if (quoted && c === '\\') this.at++;
        else if (c === '"') quoted = !quoted;
        else if (!quoted && c === '(') level++;
        else if (!quoted && c === ')') level--;
        this.at++;
        if (level === 0) {
          const inner = this.src.slice(start + 1, this.at - 1);
          if (inner.trim() === '') throw new ExprError('Empty brackets', start);
          if (depth + 1 > MAX_DEPTH) throw new ExprError('Nested too deeply', start);
          try {
            return parse(inner);
          } catch (e) {
            if (e instanceof ExprError) throw new ExprError(e.message, start + 1 + e.at);
            throw e;
          }
        }
      }
      throw new ExprError('A bracket was opened and not closed', start);
    }
    if (this.src[this.at] === '"') {
      this.at++;
      let out = '';
      while (this.at < this.src.length) {
        const c = this.src[this.at];
        if (c === '\\') {
          if (this.at + 1 >= this.src.length)
            throw new ExprError('A value ends with a lone backslash', this.at);
          out += this.src[this.at + 1];
          this.at += 2;
        } else if (c === '"') {
          this.at++;
          return out;
        } else {
          out += c;
          this.at++;
        }
      }
      throw new ExprError('A quoted value was not closed', start);
    }
    while (this.at < this.src.length && !',+()'.includes(this.src[this.at])) this.at++;
    const value = this.src.slice(start, this.at).trim();
    if (value === '') throw new ExprError('A condition has no value', start);
    return value;
  }
}

/* --- Printing --------------------------------------------------------------- */

/** Incomplete conditions (no filter, no value, empty groups) are left out, so
 *  a half-built tree still prints what is usable. */
export function print(root: Group): string {
  return printNode(root, 'or');
}

export function complete(n: Node): boolean {
  if (n.kind === 'group') return n.items.some(complete);
  if (!n.name) return false;
  return typeof n.value === 'string' ? n.value.trim() !== '' : complete(n.value);
}

function printNode(n: Node, context: 'or' | 'and'): string {
  if (n.kind === 'leaf') {
    if (!complete(n)) return '';
    const value = typeof n.value === 'string' ? quote(n.value.trim()) : `(${print(n.value)})`;
    return `${n.name}${n.op}${value}`;
  }
  const parts = n.items.filter(complete).map(item => printNode(item, n.and ? 'and' : 'or'));
  if (parts.length === 0) return '';
  const inner = parts.join(n.and ? '+' : ',');
  if (n.not) return `!(${inner})`;
  return context === 'and' && !n.and && parts.length > 1 ? `(${inner})` : inner;
}

function quote(value: string): string {
  if (!/[,+()"\\]/.test(value)) return value;
  return `"${value.replace(/["\\]/g, c => '\\' + c)}"`;
}

/* --- Tidying ---------------------------------------------------------------- */

export interface TidyRules {
  /** Whether a filter reads a comma list as "any of", so leaves can merge. */
  mergeable(type: string, name: string): boolean;
  /** The related type a bracketed value is about. */
  nested(type: string, name: string): string | undefined;
}

/** Same meaning, fewer parts: drops unfinished conditions, flattens groups
 *  into a parent of the same kind, unwraps single-item groups, folds negation
 *  into operators, merges a=x,a=y into a="x,y" (and a!=x+a!=y into a!="x,y"),
 *  and removes duplicates. */
export function tidy(root: Group, type: string, rules: TidyRules): Group {
  const out = tidyNode(root, type, rules);
  if (!out) return group();
  return out.kind === 'group' ? out : group(true, [out]);
}

function tidyNode(n: Node, type: string, rules: TidyRules): Node | null {
  if (n.kind === 'leaf') {
    if (!complete(n)) return null;
    if (typeof n.value === 'string') return { ...n, value: n.value.trim() };
    const inner = tidyNode(n.value, rules.nested(type, n.name) ?? type, rules);
    if (!inner) return null;
    return { ...n, value: inner.kind === 'group' ? inner : group(true, [inner]) };
  }

  let items: Node[] = [];
  for (const item of n.items) {
    const t = tidyNode(item, type, rules);
    if (!t) continue;
    if (t.kind === 'group' && !t.not && t.and === n.and) items.push(...t.items);
    else items.push(t);
  }
  items = dedupe(merge(items, n.and, type, rules));
  if (items.length === 0) return null;
  if (items.length === 1) return n.not ? negate(items[0]) : items[0];
  return { ...n, items };
}

function merge(items: Node[], and: boolean, type: string, rules: TidyRules): Node[] {
  // Under or, a=x,a=y is a="x,y"; under and, a!=x+a!=y is a!="x,y".
  const op: Op = and ? '!=' : '=';
  const out: Node[] = [];
  const at = new Map<string, number>();
  for (const item of items) {
    if (
      item.kind === 'leaf' &&
      item.op === op &&
      typeof item.value === 'string' &&
      rules.mergeable(type, item.name)
    ) {
      const seen = at.get(item.name);
      if (seen !== undefined) {
        const prev = out[seen] as Leaf;
        out[seen] = { ...prev, value: union(prev.value as string, item.value) };
        continue;
      }
      at.set(item.name, out.length);
    }
    out.push(item);
  }
  return out;
}

function union(a: string, b: string): string {
  return [...new Set([...a.split(','), ...b.split(',')].map(v => v.trim()).filter(Boolean))].join(
    ',',
  );
}

function dedupe(items: Node[]): Node[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = outline(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The tree's structure as text, for telling whether tidying changes anything. */
export function outline(n: Node): string {
  if (n.kind === 'leaf')
    return n.name + n.op + (typeof n.value === 'string' ? n.value : `(${outline(n.value)})`);
  return `${n.not ? '!' : ''}${n.and ? '&' : '|'}[${n.items.map(outline).join(';')}]`;
}

/** Switches the connector before items[i], regrouping by precedence (and binds
 *  tighter): in a+b+c, making the second one "or" gives (a+b),c; in a,b,c,
 *  making it "and" gives a,(b+c). */
export function switchAt(g: Group, i: number): Group {
  if (g.items.length === 2) return { ...g, and: !g.and };
  if (g.and) {
    const side = (items: Node[]) => (items.length === 1 ? items[0] : group(true, items));
    return { ...g, and: false, items: [side(g.items.slice(0, i)), side(g.items.slice(i))] };
  }
  const pair = [g.items[i - 1], g.items[i]].flatMap(n =>
    n.kind === 'group' && n.and && !n.not ? n.items : [n],
  );
  return { ...g, items: [...g.items.slice(0, i - 1), group(true, pair), ...g.items.slice(i + 1)] };
}
