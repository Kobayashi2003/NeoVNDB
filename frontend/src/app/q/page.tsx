/** One search across all seven kinds of thing.
 *
 *  The listings each search their own kind, which is what a reader who knows
 *  what they are looking for wants. This is for the other case: a name, and no
 *  certainty about whether it belongs to a work, a person, a company or a
 *  character. Every kind is asked, and each answers with its best few.
 *
 *  A whole id is not a search. Typed into the box, pasted from somewhere, or
 *  followed as a link, `v17` means one particular visual novel, so it is sent
 *  there rather than looked for. */
import { redirect } from "next/navigation"
import Link from "next/link"
import type { Metadata } from "next"
import { list } from "@/lib/api"
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

/** A letter and a number that names something. The number is checked rather
 *  than just matched: `v0` looks like an id and is not one, and sending a
 *  reader who typed it to a page that cannot exist is worse than searching for
 *  it. Leading zeros are allowed and dropped, so `v017` lands on v17 rather
 *  than on an address only it would ever use. */
const AN_ID = /^([vrcpsgi])0*([1-9][0-9]*)$/i

export default async function SearchPage({ searchParams }: PageProps<"/q">) {
  const params = await searchParams
  const term = (one(params, "q") ?? "").trim()

  const id = AN_ID.exec(term)
  if (id) redirect(`/${id[1].toLowerCase()}${id[2]}`)

  const groups = term ? await Promise.all(TYPES.map((type) => ask(type, term))) : []
  const found = groups.filter((g) => g.count > 0)

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col px-4 py-6 pb-12 animate-slide-up-fade">
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
          {found.map(({ type, rows, count }) => (
            <section key={type} className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="flex items-baseline gap-2 text-sm font-semibold">
                  <span className="inline-block h-3 w-0.5 translate-y-0.5 rounded bg-accent" aria-hidden />
                  {LIST[type].label}
                  <span className="text-xs font-normal tabular-nums text-muted">
                    {count.toLocaleString()}
                  </span>
                </h2>
                {count > rows.length && (
                  <Link
                    href={`/${type}?search=${encodeURIComponent(term)}`}
                    className="shrink-0 text-xs text-accent transition-colors hover:underline"
                  >
                    All {count.toLocaleString()}
                  </Link>
                )}
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
  try {
    const answer = await list<unknown>(spec.type, {
      fields: spec.fields,
      limit: PER_TYPE,
      // The strongest match first, which is the only order a mixed page can
      // be read in.
      sort: "searchrank",
      reverse: true,
      filters: { search: term },
    })
    return { type, rows: answer.results, count: answer.count }
  } catch {
    return { type, rows: [] as unknown[], count: 0 }
  }
}
