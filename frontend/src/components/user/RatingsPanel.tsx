/** Everything the reader rated, one type at a time, for changing ratings in
 *  bulk. A rating belongs to an item, not to a list, so this is the one place
 *  that shows every one of them. */
"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { clearRatings, ratedItems, ratingCounts, ratings, setRatings } from "@/lib/user"
import { one, withParams, type Params } from "@/lib/href"
import { LIST } from "@/lib/list"
import { cn } from "@/lib/utils"
import { TYPES } from "@/components/layout/shelves"
import { useSession } from "@/hooks/useSession"
import { ShelfPanel, type OwnSort, type ShelfSource } from "./ShelfPanel"
import { RatingsBar } from "./RatingsBar"
import { SignInFirst } from "./SignInFirst"

const PATH = "/u/ratings"

/** The orders only the user service knows. */
const OWN: OwnSort[] = [
  { value: "mine", by: "rating", label: "My rating", descending: true },
  { value: "rated", by: "rated", label: "Rated on", descending: true },
]

export function RatingsPanel({ page, params }: { page: number; params: Params }) {
  const session = useSession()
  if (session.status === "unknown") {
    return <div className="h-64 w-full animate-pulse rounded-lg bg-white/5" aria-hidden />
  }
  if (session.status === "out") {
    return <SignInFirst next={PATH}>Your ratings are yours, so they need you.</SignInFirst>
  }
  return <Ratings page={page} params={params} />
}

function Ratings({ page, params }: { page: number; params: Params }) {
  const asked = one(params, "type") ?? "v"
  const type = (TYPES as readonly string[]).includes(asked) ? asked : "v"
  const [counts, setCounts] = useState<Record<string, number> | null>(null)
  const [changes, setChanges] = useState(0)

  useEffect(() => {
    let live = true
    ratingCounts().then(
      (got) => {
        if (live) setCounts(got)
      },
      () => {},
    )
    return () => {
      live = false
    }
  }, [changes])

  const source = useMemo<ShelfSource>(
    () => ({
      page: (order, p, limit) => ratings(type, order, p, limit).then((r) => ({ rows: r.results, count: r.count })),
      all: (order) => ratedItems(type, order),
    }),
    [type],
  )

  return (
    <ShelfPanel
      type={type}
      source={source}
      sourceKey={`ratings:${type}`}
      own={OWN}
      path={PATH}
      params={params}
      page={page}
      noun="your ratings"
      title="Your ratings"
      reloads={changes}
      tabs={
        <nav aria-label="Kinds rated" className="flex flex-wrap gap-1">
          {TYPES.map((t) => (
            <Link
              key={t}
              href={withParams(PATH, params, { type: t === "v" ? null : t, page: null, sort: null, reverse: null, q: null })}
              aria-current={t === type ? "page" : undefined}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                t === type ? "bg-white/20 text-white" : "text-muted hover:bg-white/10 hover:text-white",
              )}
            >
              {LIST[t].label}
              {counts?.[t] ? <span className="ml-1.5 tabular-nums text-muted">{counts[t]}</span> : null}
            </Link>
          ))}
        </nav>
      }
      empty={`No ${LIST[type].label.toLowerCase()} rated yet. Rate one from its own page and it shows up here.`}
      bar={(c) => (
        <RatingsBar
          chosen={c.chosen.length}
          pageSize={c.here.length}
          allOnPage={c.allOnPage}
          busy={c.busy}
          error={c.error}
          onAll={c.onAll}
          onRate={(value) => c.act(() => setRatings(c.chosen, value).then(() => setChanges((n) => n + 1)))}
          onClear={() => c.act(() => clearRatings(c.chosen).then(() => setChanges((n) => n + 1)))}
          onClose={c.onClose}
        />
      )}
    />
  )
}
