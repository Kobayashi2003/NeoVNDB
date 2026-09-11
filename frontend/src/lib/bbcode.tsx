/** vndb writes descriptions in a small BBCode dialect. Anything not listed
 *  here is left as written -- showing the markup is better than swallowing the
 *  text around it. */

import Link from "next/link"
import { Spoiler } from "@/components/ui/Spoiler"

/** [raw] and [code] come first: what they contain is not markup, so the
 *  scanner must consume them whole before anything inside can match. */
const TOKEN = new RegExp(
  [
    String.raw`\[raw\]([\s\S]*?)\[\/raw\]`,
    String.raw`\[code\]([\s\S]*?)\[\/code\]`,
    String.raw`\[quote\]([\s\S]*?)\[\/quote\]`,
    String.raw`\[spoiler\]([\s\S]*?)\[\/spoiler\]`,
    String.raw`\[url=([^\]]+)\]([\s\S]*?)\[\/url\]`,
    String.raw`\[(b|i|u|s)\]([\s\S]*?)\[\/\4\]`,
    // A bare id such as v17 or c521; vndb links these wherever they appear.
    String.raw`\b([vrcpsgi]\d+)\b`,
  ].join("|"),
  "g",
)

const EMPHASIS: Record<string, string> = {
  b: "font-semibold",
  i: "italic",
  u: "underline",
  s: "line-through",
}

export function BBCode({ text }: { text: string }) {
  const out: React.ReactNode[] = []
  let last = 0

  for (const m of text.matchAll(TOKEN)) {
    const [whole, raw, code, quote, spoiler, href, label, tag, emphasised, id] = m
    if (m.index > last) out.push(text.slice(last, m.index))
    last = m.index + whole.length
    const key = last

    if (raw !== undefined) {
      out.push(raw)
    } else if (code !== undefined) {
      out.push(
        <code key={key} className="rounded bg-white/10 px-1 text-xs">
          {code}
        </code>,
      )
    } else if (quote !== undefined) {
      out.push(
        <blockquote key={key} className="my-2 border-l-2 border-accent/40 pl-3 text-muted">
          <BBCode text={quote} />
        </blockquote>,
      )
    } else if (spoiler !== undefined) {
      out.push(<Spoiler key={key}>{spoiler}</Spoiler>)
    } else if (href !== undefined) {
      out.push(
        <a key={key} href={href} rel="noreferrer noopener" className="text-accent hover:text-accent-hover">
          {label}
        </a>,
      )
    } else if (tag !== undefined) {
      out.push(
        <span key={key} className={EMPHASIS[tag]}>
          <BBCode text={emphasised} />
        </span>,
      )
    } else if (id !== undefined) {
      out.push(
        <Link key={key} href={`/${id}`} className="text-accent hover:text-accent-hover">
          {id}
        </Link>,
      )
    }
  }
  out.push(text.slice(last))

  return <div className="whitespace-pre-wrap text-sm leading-relaxed text-white/90">{out}</div>
}
