/** The relation graph for one visual novel, at its own address under the
 *  novel's: /v17/rg, the way vndb writes it.
 *
 *  The depth is in the address like every other piece of state here, so a
 *  graph opened out to five steps is a link somebody can be sent. */

import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { ApiError, byId, relationGraph } from "@/lib/api"
import { one, withParams } from "@/lib/href"
import { cn } from "@/lib/utils"
import { ControlLabel } from "@/components/ui/ControlLabel"
import { Name } from "@/components/ui/Name"
import { OriginalToggle } from "@/components/ui/PrefsControls"
import { RelationGraph } from "@/components/vn/RelationGraph"
import type { RelationGraph as Graph } from "@/lib/graph"

const DEPTHS = [1, 2, 3, 4, 5]

export default async function RelationGraphPage({ params, searchParams }: PageProps<"/[slug]/rg">) {
  const { slug } = await params
  const query = await searchParams
  if (!/^v\d+$/.test(slug)) notFound()

  const asked = Number(one(query, "depth"))
  const depth = DEPTHS.includes(asked) ? asked : 2

  const vn = await byId<{ title: string | null; alttitle: string | null }>(
    "vn",
    slug,
    "title,alttitle",
  )
  if (!vn) notFound()

  let graph: Graph
  try {
    graph = await relationGraph<Graph>(slug, depth)
  } catch (e) {
    // A graph the API refused to draw is not a missing page; say which it is.
    const why = e instanceof ApiError && e.status === 400 ? e.message : "Something went wrong."
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-8 animate-slide-up-fade">
        <Back id={slug} />
        <p role="alert" className="mt-4 text-sm text-red-400">
          {why}
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 pb-12 animate-slide-up-fade">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Back id={slug} />
          {/* Through Name, so the heading answers the script toggle beside it
              the same way the cards in the graph do. */}
          <h1 className="mt-1 truncate text-xl font-bold sm:text-2xl">
            Related to <Name name={vn.title} original={vn.alttitle} fallback={slug} />
          </h1>
        </div>
        <OriginalToggle />
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <ControlLabel>Steps out</ControlLabel>
        {DEPTHS.map((d) => (
          <Link
            key={d}
            href={withParams(`/${slug}/rg`, query, { depth: d === 2 ? null : String(d) })}
            aria-current={d === depth ? "page" : undefined}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium tabular-nums transition-colors",
              d === depth
                ? "bg-white/20 text-white"
                : "text-muted hover:bg-white/10 hover:text-white",
            )}
          >
            {d}
          </Link>
        ))}
        <span className="ml-2 text-xs text-muted tabular-nums">
          {graph.nodes.length} titles
        </span>
      </div>

      <RelationGraph graph={graph} />
    </main>
  )
}

function Back({ id }: { id: string }) {
  return (
    <Link
      href={`/${id}`}
      className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-white"
    >
      <ArrowLeft className="h-3 w-3" aria-hidden />
      Back to the novel
    </Link>
  )
}

export async function generateMetadata({ params }: PageProps<"/[slug]/rg">) {
  const { slug } = await params
  if (!/^v\d+$/.test(slug)) return { title: "NeoVNDB" }
  const vn = await byId<{ title: string | null }>("vn", slug, "title")
  return { title: vn?.title ? `Relations: ${vn.title} - NeoVNDB` : "NeoVNDB" }
}
