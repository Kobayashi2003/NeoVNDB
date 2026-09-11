/** Every entity lives directly under the root, at its own id.
 *
 *  A vndb id already says what it is -- v17 is a visual novel, c521 a
 *  character -- so a /v/ segment in front of v17 would be saying it twice, and
 *  a link can be written as the id and nothing else. This route reads the type
 *  off the front of the id and hands the rest to that type's page.
 *
 *  Static segments win over a dynamic one in the App Router, so a future /
 *  search or /about is unaffected by this catching everything else. */

import { notFound } from "next/navigation"
import { byId } from "@/lib/api"
import { VN_PAGE } from "@/lib/fields"
import { VNPage } from "@/components/vn/VNPage"
import type { VN } from "@/lib/types"

/** The seven types the dump carries, each with the letter vndb gives it. */
const ID = /^([vrcpsgi])\d+$/

function typeOf(slug: string): string | null {
  return ID.exec(slug)?.[1] ?? null
}

export default async function Page({ params }: PageProps<"/[slug]">) {
  const { slug } = await params

  switch (typeOf(slug)) {
    case "v": {
      const vn = await byId<VN>("vn", slug, VN_PAGE)
      if (!vn) notFound()
      return <VNPage vn={vn} />
    }
    default:
      notFound()
  }
}

export async function generateMetadata({ params }: PageProps<"/[slug]">) {
  const { slug } = await params

  switch (typeOf(slug)) {
    case "v": {
      const vn = await byId<{ title: string | null }>("vn", slug, "title")
      return { title: vn?.title ? `${vn.title} - NeoVNDB` : "NeoVNDB" }
    }
    default:
      return { title: "NeoVNDB" }
  }
}
