/** One list, and the things on it.
 *
 *  A list holds ids and nothing else -- the user service keeps no copy of what
 *  vndb says, so that a weekly import can replace the whole mirror underneath
 *  it without touching anyone's lists. Which means drawing one is two steps:
 *  ask the service what is on it, then hand those ids to the read API, which
 *  answers a whole page of them in one request. That is what the id-list limit
 *  was for, and it is why a page of marks is no bigger than it.
 *
 *  The read API answers in its own order, so the rows are put back into the
 *  order the reader made: most recently added first. A collection is a record
 *  of what someone did, and when they did it is the only order that is theirs
 *  rather than the data's. */
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { list as query } from "@/lib/api"
import { LIST, PAGE_SIZE } from "@/lib/list"
import type { Params } from "@/lib/href"
import { Results } from "@/components/list/Results"
import { Pagination } from "@/components/list/Pagination"
import { collections, marks, UserError, type Collection } from "@/lib/user"
import { useSession } from "@/hooks/useSession"
import { SignInFirst } from "./SignInFirst"

interface Held {
  list: Collection
  rows: unknown[]
  count: number
}

export function CollectionPanel({
  id,
  page,
  params,
}: {
  id: number
  page: number
  params: Params
}) {
  const session = useSession()
  const [held, setHeld] = useState<Held | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (session.status !== "in") return
    let live = true

    const read = async (): Promise<Held> => {
      const [mine, held] = await Promise.all([collections(), marks(id, page, PAGE_SIZE)])
      const list = mine.find((l) => l.id === id)
      if (!list) throw new UserError(404, "No such list.")
      if (held.results.length === 0) return { list, rows: [], count: held.count }

      const order = held.results.map((m) => m.id)
      const spec = LIST[list.type]
      const answer = await query<{ id: string }>(spec.type, {
        fields: spec.fields,
        limit: order.length,
        filters: { id: order.join(",") },
      })
      const byId = new Map(answer.results.map((r) => [r.id, r]))
      // An id with nothing behind it is not an error: vndb hides entries, and
      // a hidden one leaves a mark pointing at nothing until the reader
      // removes it. Better a list one short than a list that will not draw.
      const rows = order.map((mark) => byId.get(mark)).filter((r) => r !== undefined)
      return { list, rows, count: held.count }
    }

    read().then(
      (got) => {
        if (live) setHeld(got)
      },
      (err) => {
        if (live) setError(err instanceof UserError ? err.message : "Something went wrong.")
      },
    )
    return () => {
      live = false
    }
  }, [session.status, id, page])

  if (session.status === "unknown") {
    return <div className="h-40 w-full animate-pulse rounded-lg bg-white/5" aria-hidden />
  }
  if (session.status === "out") {
    return <SignInFirst next={`/u/${id}`}>This is one of your lists, so it needs you.</SignInFirst>
  }
  if (error) {
    return (
      <div className="w-full max-w-sm rounded-lg border border-white/5 bg-surface p-6 text-sm">
        <p role="alert" className="text-red-400">
          {error}
        </p>
        <Back />
      </div>
    )
  }
  if (held === null) {
    return <div className="h-64 w-full animate-pulse rounded-lg bg-white/5" aria-hidden />
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-xl font-bold sm:text-2xl">
          {held.list.name}
          <span className="ml-2 text-sm font-normal tabular-nums text-muted">
            {held.count.toLocaleString()}
          </span>
        </h1>
        <Back />
      </div>

      {held.rows.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing on this list yet. Saving something from its own page puts it here --{" "}
          <Link href={`/${held.list.type}`} className="text-accent hover:underline">
            browse {LIST[held.list.type].label.toLowerCase()}
          </Link>
          .
        </p>
      ) : (
        <>
          <Results type={held.list.type} rows={held.rows} />
          <Pagination
            path={`/u/${id}`}
            params={params}
            page={page}
            count={held.count}
            pageSize={PAGE_SIZE}
          />
        </>
      )}
    </div>
  )
}

function Back() {
  return (
    <Link
      href="/u"
      className="flex shrink-0 items-center gap-1 text-xs text-muted transition-colors hover:text-white"
    >
      <ArrowLeft className="h-3 w-3" aria-hidden />
      All lists
    </Link>
  )
}
