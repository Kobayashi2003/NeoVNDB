import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { CollectionPanel } from "@/components/user/CollectionPanel"

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
    <main className="mx-auto flex w-full max-w-7xl flex-col px-4 py-6 pb-12 animate-slide-up-fade">
      {/* Keyed, so turning a page starts a fresh panel rather than leaving the
          last page's rows on screen while the next ones are fetched. */}
      <CollectionPanel key={`${list}:${page}`} id={list} page={page} params={query} />
    </main>
  )
}
