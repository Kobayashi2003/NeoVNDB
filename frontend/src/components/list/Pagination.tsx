/** Page links.
 *
 *  Links rather than buttons, because the page a reader is on is part of the
 *  address: a result they want to come back to should survive being
 *  bookmarked, and the back button should walk the pages they actually
 *  visited.
 *
 *  The window is fixed at five so the control does not change width as the
 *  reader moves through it, with the ends always reachable. */

import Link from "next/link"
import { cn } from "@/lib/utils"
import { withParams, type Params } from "@/lib/href"

const STEP =
  "flex h-8 min-w-8 items-center justify-center rounded px-2 text-xs transition-colors"

/** The page numbers to draw: a window around the current page, plus both ends,
 *  with gaps marked. */
function window(current: number, last: number): (number | "gap")[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1)

  const near = [current - 1, current, current + 1].filter((n) => n > 1 && n < last)
  const out: (number | "gap")[] = [1]
  if (near[0] > 2) out.push("gap")
  out.push(...near)
  if (near[near.length - 1] < last - 1) out.push("gap")
  out.push(last)
  return out
}

export function Pagination({
  path,
  params,
  page,
  count,
  pageSize,
}: {
  path: string
  params: Params
  page: number
  count: number
  pageSize: number
}) {
  const last = Math.max(1, Math.ceil(count / pageSize))
  if (last <= 1) return null

  const at = Math.min(page, last)
  const href = (n: number) => withParams(path, params, { page: n === 1 ? null : n })

  return (
    <nav className="flex flex-wrap items-center justify-center gap-1" aria-label="Pages">
      <Step href={href(at - 1)} disabled={at <= 1} label="Previous">
        &lsaquo;
      </Step>

      {window(at, last).map((n, i) =>
        n === "gap" ? (
          <span key={`gap-${i}`} className="px-1 text-xs text-muted">
            &hellip;
          </span>
        ) : (
          <Link
            key={n}
            href={href(n)}
            aria-current={n === at ? "page" : undefined}
            className={cn(
              STEP,
              "tabular-nums",
              n === at
                ? "bg-accent font-medium text-black"
                : "text-muted hover:bg-white/10 hover:text-white",
            )}
          >
            {n}
          </Link>
        ),
      )}

      <Step href={href(at + 1)} disabled={at >= last} label="Next">
        &rsaquo;
      </Step>
    </nav>
  )
}

function Step({
  href,
  disabled,
  label,
  children,
}: {
  href: string
  disabled: boolean
  label: string
  children: React.ReactNode
}) {
  if (disabled) {
    return (
      <span aria-hidden className={cn(STEP, "cursor-not-allowed text-muted/30")}>
        {children}
      </span>
    )
  }
  return (
    <Link href={href} aria-label={label} className={cn(STEP, "text-muted hover:bg-white/10 hover:text-white")}>
      {children}
    </Link>
  )
}
