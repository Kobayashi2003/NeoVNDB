/** Front page: one month of releases, plus a line of mirror counts. Starts
 *  with titles originally in Japanese (most monthly releases are small
 *  English works with no votes); the toggle undoes that. */

import Link from "next/link"
import { one, withParams, type Params } from "@/lib/href"
import { LIST } from "@/lib/list"
import { countOf, fetchResults } from "@/lib/results"
import { ResultsPanel } from "@/components/list/ResultsPanel"
import { DataAge } from "@/components/layout/DataAge"
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

      <div className="border-t border-white/5 pt-5">
        <ResultsPanel
          type="v"
          path="/"
          params={params}
          data={data}
          controls={
            <>
              <div className="flex flex-wrap items-center gap-2">
                <ControlLabel>Released in</ControlLabel>
                <MonthPicker path="/" params={params} year={year} month={month} />
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <ControlLabel>Originally</ControlLabel>
                <Origin path="/" params={params} on={japanese} value={null} label="Japanese" />
                <Origin path="/" params={params} on={!japanese} value="all" label="Any language" />
              </div>
            </>
          }
        empty={
          <>
            Nothing came out in {monthName(month)} {year}
            {japanese && " that was originally in Japanese"}.
          </>
        }
        />
      </div>

      <DataAge />
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
