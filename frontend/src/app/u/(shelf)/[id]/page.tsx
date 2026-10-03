import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { CollectionPanel } from "@/components/user/CollectionPanel"
import { one } from "@/lib/href"

export const metadata: Metadata = { title: "A list - NeoVNDB" }

export default async function CollectionPage({ params, searchParams }: PageProps<"/u/[id]">) {
  const { id } = await params
  const query = await searchParams

  // The name cannot be in the title: who a list belongs to is not known until
  // the page is in a browser, so the server has nothing to put there.
  const list = Number(id)
  if (!Number.isInteger(list) || list < 1) notFound()

  const raw = query.page
  const page = Math.max(1, Number(Array.isArray(raw) ? raw[0] : raw) || 1)

  return (
    // From lg up the page is a viewport-high box whose columns scroll on their
    // own, so its own vertical padding moves into the columns.
    <main className="mx-auto flex w-full max-w-page flex-col px-4 py-6 pb-12 animate-slide-up-fade lg:h-[calc(100vh-var(--header-h,0px))] lg:overflow-hidden lg:py-0">
      {/* Keyed on everything that decides what is on the page, so changing any
          of them starts a fresh panel rather than leaving the last answer on
          screen while the next one is fetched -- and drops a selection that
          was made against rows no longer shown. */}
      <CollectionPanel
        key={`${list}:${page}:${one(query, "sort") ?? ""}:${one(query, "reverse") ?? ""}:${one(query, "q") ?? ""}`}
        id={list}
        page={page}
        params={query}
      />
    </main>
  )
}
