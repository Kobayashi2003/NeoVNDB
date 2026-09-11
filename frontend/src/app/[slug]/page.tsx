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
import { CHARACTER_PAGE, INSTANCE_GROUP, VN_PAGE } from "@/lib/fields"
import { VNPage } from "@/components/vn/VNPage"
import { CharacterPage } from "@/components/character/CharacterPage"
import type { CharacterDetail, Instance, VN } from "@/lib/types"

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
    case "c": {
      const character = await byId<CharacterDetail>("character", slug, CHARACTER_PAGE)
      if (!character) notFound()
      // chars.main points from an instance to its parent and no further, so a
      // character in the middle of a group has to ask the top of it for the
      // rest -- one extra read, and only for the pages that need it.
      const top = character.instance_of
        ? await byId<{ name: string; original: string | null; image: Instance["image"]; instances: Instance[] }>(
            "character",
            character.instance_of,
            INSTANCE_GROUP,
          )
        : null
      const parent = top
        ? {
            character: {
              id: character.instance_of!,
              name: top.name,
              original: top.original,
              image: top.image,
              spoiler: character.instance_of_spoiler,
            },
            instances: top.instances,
          }
        : null
      return <CharacterPage character={character} parent={parent} />
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
    case "c": {
      const c = await byId<{ name: string | null }>("character", slug, "name")
      return { title: c?.name ? `${c.name} - NeoVNDB` : "NeoVNDB" }
    }
    default:
      return { title: "NeoVNDB" }
  }
}
