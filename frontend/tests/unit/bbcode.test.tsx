import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BBCode } from '@/components/ui/BBCode';
import { plain } from '@/lib/bbcode';

const html = (text: string) => renderToStaticMarkup(<BBCode text={text} />);

describe('BBCode', () => {
  it('renders the dialect', () => {
    expect(html('[b]bold[/b]')).toContain('<span class="font-semibold">');
    expect(html('[url=https://vndb.org]site[/url]')).toContain('href="https://vndb.org"');
    expect(html('see v17')).toContain('href="/v17"');
    expect(html('[quote]q[/quote]')).toContain('<blockquote');
  });

  it('renders nested markup inline', () => {
    const out = html('[quote][b]a[/b] v17[/quote]');
    expect(out).toContain(
      '<blockquote class="my-2 border-l-2 border-accent/40 pl-3 text-muted"><span class="font-semibold">a</span>',
    );
    expect(out.match(/<div/g)).toHaveLength(1);
  });

  it('keeps [raw] and [code] contents as text', () => {
    expect(html('[raw][b]v17[/b][/raw]')).not.toContain('<span');
    expect(html('[code]v17[/code]')).not.toContain('href');
  });

  it('escapes what it does not recognise', () => {
    expect(html('<script>x</script>')).not.toContain('<script>');
    expect(html('[color=red]x[/color]')).toContain('[color=red]');
  });

  it('reads tags in any case, as vndb does, but ids only in lower case', () => {
    expect(html('[URL=https://vndb.org/g1903]sprite[/URL]')).toContain(
      'href="https://vndb.org/g1903"',
    );
    expect(html('[B]bold[/B]')).toContain('<span class="font-semibold">');
    expect(html('V17')).not.toContain('href');
    expect(plain('a [URL=https://x.org]link[/URL] [I]b[/I]')).toBe('a link b');
  });

  it('links only to web addresses', () => {
    for (const href of ['javascript:alert(1)', 'data:text/html,x', ' javascript:x']) {
      expect(html(`[url=${href}]x[/url]`)).not.toContain('href=');
    }
    expect(html('[url=/v17]x[/url]')).toContain('href="/v17"');
  });
});

describe('plain', () => {
  it('takes the markup off', () => {
    expect(plain('[b]A[/b] [url=https://x]link[/url]\n\n[spoiler]s[/spoiler]')).toBe('A link s');
  });
});
