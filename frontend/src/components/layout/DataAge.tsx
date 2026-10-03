/** Which vndb dump the page shows. Only on normally scrolling pages: under
 *  a detail page's viewport-high columns it would add a scrollbar. */
import Link from "next/link"
import { generation } from "@/lib/api"

export async function DataAge() {
  const now = await generation()
  if (!now) return null

  return (
    <p className="mt-10 text-xs text-muted/60">
      Mirror of vndb.{" "}
      {/* An archive imported from a file carries no publication date. */}
      {now.published_at ? `Dump published ${day(now.published_at)}` : `Dump ${now.code}`}, imported{" "}
      {day(now.imported_at)}.{" "}
      <Link href="/api" className="underline-offset-2 transition-colors hover:text-white hover:underline">
        API
      </Link>
    </p>
  )
}

/** The date alone, written the way every other date on the site is. The time
 *  of day is in the answer and is nobody's business here. */
function day(iso: string): string {
  return iso.slice(0, 10)
}
