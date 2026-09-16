/** The way in.
 *
 *  What came out, and what is in here. A front page for a mirror of vndb has
 *  two things to say and they are not the same: what is worth looking at now,
 *  and how much of vndb this copy actually holds. The month of releases
 *  answers the first and is most of the page; the counts answer the second in
 *  one line, because "how complete is it" is a question a reader asks once.
 *
 *  Most of what comes out in any month is small English-language work with no
 *  votes yet -- in a recent month, 173 of 289 against 63 originally in
 *  Japanese. Starting with the Japanese ones is what makes the page a place to
 *  look rather than a list to wade through, but it is a choice, so it is shown
 *  as one and is a click away from being undone. */

import Link from "next/link"
import { one, withParams, type Params } from "@/lib/href"
import { LIST } from "@/lib/list"
import { countOf, fetchResults } from "@/lib/results"
import { ResultsPanel } from "@/components/list/ResultsPanel"
import { PrefsControls } from "@/components/ui/PrefsControls"
import { ControlLabel } from "@/components/ui/ControlLabel"
import { MonthPicker } from "@/components/home/MonthPicker"
import { monthName } from "@/lib/months"

const TYPES = ["v", "c", "r", "p", "s", "g", "i"] as const

/** Bounded so a hand-typed address cannot ask for a month that is not one. */
function monthFrom(params: Params): { year: number; month: number } {
  const now = new Date()
  const year = Number(one(params, "year"))
  const month = Number(one(params, "month"))
  return {
    year: Number.isInteger(year) && year >= 1970 && year <= 2200 ? year : now.getFullYear(),
    month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : now.getMonth() + 1,
  }
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams
  const { year, month } = monthFrom(params)
  const japanese = one(params, "olang") !== "all"

  const released = `${year}-${String(month).padStart(2, "0")}`
  const filters = { released, ...(japanese ? { olang: "ja" } : {}) }

  const [counts, data] = await Promise.all([
    Promise.all(TYPES.map((t) => countOf(t, {}))),
    // By when, not by how well liked: the question this page asks is what came
    // out, and the answer to that is in date order.
    fetchResults("v", params, filters, "released"),
  ])

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 pb-12 animate-slide-up-fade">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">NeoVNDB</h1>
        <p className="mt-1 text-sm text-muted">
          A local mirror of vndb&apos;s public dump, and a way to read it.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          {TYPES.map((type, i) => (
            <Link
              key={type}
              href={`/${type}`}
              className="group flex items-baseline gap-1.5 text-xs transition-colors hover:text-white"
            >
              <span className="font-semibold tabular-nums text-accent">
                {counts[i].toLocaleString()}
              </span>
              <span className="text-muted transition-colors group-hover:text-white">
                {LIST[type].label}
              </span>
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <ControlLabel>Released in</ControlLabel>
          <MonthPicker path="/" params={params} year={year} month={month} />
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <ControlLabel>Originally</ControlLabel>
          <Origin path="/" params={params} on={japanese} value={null} label="Japanese" />
          <Origin path="/" params={params} on={!japanese} value="all" label="Any language" />
        </div>
      </div>

      <ResultsPanel
        type="v"
        path="/"
        params={params}
        data={data}
        action={<PrefsControls />}
        empty={
          <>
            Nothing came out in {monthName(month)} {year}
            {japanese && " that was originally in Japanese"}.
          </>
        }
      />
    </main>
  )
}

function Origin({
  path,
  params,
  on,
  value,
  label,
}: {
  path: string
  params: Params
  on: boolean
  value: string | null
  label: string
}) {
  return (
    <Link
      href={withParams(path, params, { olang: value, page: null })}
      aria-current={on ? "page" : undefined}
      className={
        on
          ? "rounded-full bg-white/20 px-2.5 py-1 text-xs font-medium text-white"
          : "rounded-full px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-white/10 hover:text-white"
      }
    >
      {label}
    </Link>
  )
}
