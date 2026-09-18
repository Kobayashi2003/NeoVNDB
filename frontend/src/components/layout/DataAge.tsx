/** When the data on the page was taken from vndb.
 *
 *  A mirror is only as good as its last import, and a reader looking at a
 *  release date from last week should be able to tell whether this copy is
 *  old enough to be missing it. The API has always been able to say; nothing
 *  showed it.
 *
 *  On the pages that scroll normally, which is where browsing starts. A detail
 *  page is a viewport-high box whose two columns scroll on their own, and a
 *  footer under that would give the page a scrollbar whose only job is to
 *  reach one line of small print. */
import { generation } from "@/lib/api"

export async function DataAge() {
  const now = await generation()
  if (!now) return null

  return (
    <p className="mt-10 text-xs text-muted/60">
      Mirror of vndb. Dump published {day(now.published_at)}, imported{" "}
      {day(now.imported_at)}.
    </p>
  )
}

/** The date alone, written the way every other date on the site is. The time
 *  of day is in the answer and is nobody's business here. */
function day(iso: string): string {
  return iso.slice(0, 10)
}
