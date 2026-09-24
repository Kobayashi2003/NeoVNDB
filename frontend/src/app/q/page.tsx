/** Search across all seven types at once. A whole id (v17) redirects to
 *  that entry instead of searching. */
import { redirect } from "next/navigation"
import Link from "next/link"
import type { Metadata } from "next"
import { ArrowRight } from "lucide-react"
import { list } from "@/lib/api"
import { relatedSearch } from "@/lib/conditions"
import { LIST } from "@/lib/list"
import { one } from "@/lib/href"
import { TYPES } from "@/components/layout/shelves"
import { Results } from "@/components/list/Results"
import { SearchField } from "@/components/layout/SearchField"
import { DataAge } from "@/components/layout/DataAge"

export const metadata: Metadata = { title: "Search - NeoVNDB" }

/** Enough of each kind to recognise the one that was meant, and few enough
 *  that seven of them still fit on a screen worth scrolling. */
const PER_TYPE = 6

/** A letter and a positive number; v0 is searched, not followed. Leading
 *  zeros are dropped so v017 lands on v17. */
const AN_ID = /^([vrcpsgi])0*([1-9][0-9]*)$/i

/** Kinds whose matches can be turned into a question about visual novels,
 *  through the VN filter that relates to them. */
const TO_VN: Record<string, { filter: string; one: string; many: string }[]> = {
  p: [{ filter: "developer", one: "developed by this company", many: "developed by one of these" }],
  s: [
    { filter: "staff", one: "with this person on staff", many: "with one of these on staff" },
    { filter: "seiyuu", one: "voiced by this person", many: "voiced by one of these" },
  ],
  c: [{ filter: "character", one: "featuring this character", many: "featuring one of these" }],
}

export default async function SearchPage({ searchParams }: PageProps<"/q">) {
  const params = await searchParams
  const term = (one(params, "q") ?? "").trim()

  const id = AN_ID.exec(term)
  if (id) redirect(`/${id[1].toLowerCase()}${id[2]}`)

  const groups = term ? await Promise.all(TYPES.map((type) => ask(type, term))) : []
  const found = groups.filter((g) => g.count > 0)

  return (
    <main className="mx-auto flex w-full max-w-page flex-col px-4 py-6 pb-12 animate-slide-up-fade">
      <div className="mb-6 flex flex-col gap-3">
        <h1 className="text-xl font-bold sm:text-2xl">Search</h1>
        <SearchField initial={term} className="w-full max-w-xl" autoFocus={!term} />
      </div>

      {term === "" ? (
        <p className="text-sm text-muted">
          Every kind of thing at once: works, characters, releases, companies,
          people, tags and traits. A whole id such as <code className="text-white/80">v17</code>{" "}
          goes straight there.
        </p>
      ) : found.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing matched <span className="text-white/80">{term}</span>.
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          {found.map(({ type, rows, count, vns }) => (
            <section key={type} className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="flex items-baseline gap-2 text-sm font-semibold">
                  <span className="inline-block h-3 w-0.5 translate-y-0.5 rounded bg-accent" aria-hidden />
                  {LIST[type].label}
                  <span className="text-xs font-normal tabular-nums text-muted">
                    {count.toLocaleString()}
                  </span>
                </h2>
                <div className="flex flex-wrap items-baseline justify-end gap-x-4 gap-y-1 text-xs">
                  {vns.map((v) => (
                    <Link
                      key={v.expression}
                      href={`/v?f=${encodeURIComponent(v.expression)}`}
                      className="inline-flex items-center gap-1 text-muted transition-colors hover:text-white coarse:py-1"
                    >
                      <span className="tabular-nums text-white/80">{v.count.toLocaleString()}</span>
                      visual novels {v.label}
                      <ArrowRight className="icon-text size-3" aria-hidden />
                    </Link>
                  ))}
                  {count > rows.length && (
                    <Link
                      href={`/${type}?search=${encodeURIComponent(term)}`}
                      className="shrink-0 text-accent transition-colors hover:underline coarse:py-1"
                    >
                      All {count.toLocaleString()}
                    </Link>
                  )}
                </div>
              </div>
              <Results type={type} rows={rows} />
            </section>
          ))}
        </div>
      )}

      <DataAge />
    </main>
  )
}

/** One kind's best few. A kind that cannot answer is left out rather than
 *  taking the page down with it: six of the seven still being useful is a
 *  better answer than an error. */
async function ask(type: string, term: string) {
  const spec = LIST[type]
  const [answer, vns] = await Promise.all([
    list<unknown>(spec.type, {
      fields: spec.fields,
      limit: PER_TYPE,
      // The strongest match first, which is the only order a mixed page can
      // be read in.
      sort: "searchrank",
      reverse: true,
      filters: { search: term },
    }).catch(() => null),
    Promise.all((TO_VN[type] ?? []).map((v) => related(v.filter, term))),
  ])
  if (!answer) return { type, rows: [] as unknown[], count: 0, vns: [] }
  const labels = TO_VN[type] ?? []
  return {
    type,
    rows: answer.results,
    count: answer.count,
    vns: vns
      .map((v, i) => ({ ...v, label: answer.count === 1 ? labels[i].one : labels[i].many }))
      .filter((v) => v.count > 0),
  }
}

/** How many visual novels relate to anything this search matched. */
async function related(filter: string, term: string) {
  const expression = relatedSearch(filter, term)
  try {
    const answer = await list<unknown>("vn", { fields: "id", limit: 1, filters: { f: expression } })
    return { expression, count: answer.count }
  } catch {
    return { expression, count: 0 }
  }
}
