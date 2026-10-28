/** vndb writes descriptions in a small BBCode dialect. Anything not listed
 *  here is left as written -- showing the markup is better than swallowing the
 *  text around it. */

import { Fragment } from 'react';
import Link from 'next/link';
import { Spoiler } from './Spoiler';

/** [raw] and [code] come first: what they contain is not markup, so the
 *  scanner must consume them whole before anything inside can match. */
const TOKEN = new RegExp(
  [
    String.raw`\[raw\]([\s\S]*?)\[\/raw\]`,
    String.raw`\[code\]([\s\S]*?)\[\/code\]`,
    String.raw`\[quote\]([\s\S]*?)\[\/quote\]`,
    String.raw`\[spoiler\]([\s\S]*?)\[\/spoiler\]`,
    String.raw`\[url=([^\]]+)\]([\s\S]*?)\[\/url\]`,
    String.raw`\[(?<tag>b|i|u|s)\]([\s\S]*?)\[\/\k<tag>\]`,
    // A bare id such as v17 or c521; vndb links these wherever they appear.
    String.raw`\b([vrcpsgi]\d+)\b`,
  ].join('|'),
  // vndb reads its tags in any case: descriptions carry [URL=...] as often
  // as [url=...]. Ids are only ever lower case; render() checks that itself.
  'gi',
);

/** Web addresses and paths on this site; anything else (javascript:, data:)
 *  stays as its label. */
const LINKABLE = /^(https?:\/\/|\/(?!\/))/i;

const EMPHASIS: Record<string, string> = {
  b: 'font-semibold',
  i: 'italic',
  u: 'underline',
  s: 'line-through',
};

export function BBCode({ text }: { text: string }) {
  return (
    <div className="whitespace-pre-wrap text-sm leading-relaxed text-white/90">{render(text)}</div>
  );
}

/** Nested markup renders inline, inside its parent's element. Unlinked, a link
 *  is only its label: for a spoiler still hidden, which is a button. */
function render(text: string, linked = true): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;

  for (const m of text.matchAll(TOKEN)) {
    const [whole, raw, code, quote, spoiler, href, label, tag, emphasised, id] = m;
    if (m.index > last) out.push(text.slice(last, m.index));
    last = m.index + whole.length;
    const key = last;

    if (raw !== undefined) {
      out.push(raw);
    } else if (code !== undefined) {
      out.push(
        <code key={key} className="rounded bg-white/10 px-1 text-xs">
          {code}
        </code>,
      );
    } else if (quote !== undefined) {
      out.push(
        <blockquote key={key} className="my-2 border-l-2 border-accent/40 pl-3 text-muted">
          {render(quote, linked)}
        </blockquote>,
      );
    } else if (spoiler !== undefined) {
      out.push(
        <Spoiler key={key} covered={render(spoiler, false)}>
          {render(spoiler, linked)}
        </Spoiler>,
      );
    } else if (href !== undefined && (!linked || !LINKABLE.test(href))) {
      out.push(<Fragment key={key}>{render(label, linked)}</Fragment>);
    } else if (href !== undefined) {
      out.push(
        <a
          key={key}
          href={href}
          rel="noreferrer noopener"
          className="text-accent hover:text-accent-hover"
        >
          {label}
        </a>,
      );
    } else if (tag !== undefined) {
      out.push(
        <span key={key} className={EMPHASIS[tag.toLowerCase()]}>
          {render(emphasised, linked)}
        </span>,
      );
    } else if (id !== undefined && (!linked || id[0] !== id[0].toLowerCase())) {
      out.push(id);
    } else if (id !== undefined) {
      out.push(
        <Link key={key} href={`/${id}`} className="text-accent hover:text-accent-hover">
          {id}
        </Link>,
      );
    }
  }
  out.push(text.slice(last));
  return out;
}
