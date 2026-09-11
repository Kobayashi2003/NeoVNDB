/** Every entity lives directly under the root, at its own id; every type lives
 *  under the letter its ids start with.
 *
 *  A vndb id already says what it is -- v17 is a visual novel, c521 a
 *  character -- so a /v/ segment in front of v17 would be saying it twice, and
 *  a link can be written as the id and nothing else. `/v` on its own, with no
 *  number after it, is every visual novel: the same letter asking the same
 *  question without naming one.
 *
 *  Static segments win over a dynamic one in the App Router, so a future
 *  /about is unaffected by this catching everything else. */

import { notFound } from "next/navigation"
import { byId } from "@/lib/api"
import { CHARACTER_PAGE, INSTANCE_GROUP, RELEASE_PAGE, VN_PAGE } from "@/lib/fields"
import { LIST } from "@/lib/list"
import { ListPage } from "@/components/list/ListPage"
import { VNPage } from "@/components/vn/VNPage"
import { CharacterPage } from "@/components/character/CharacterPage"
import { ReleasePage } from "@/components/release/ReleasePage"
import type { CharacterDetail, Instance, ReleaseDetail, VN } from "@/lib/types"

/** The seven types the dump carries, each with the letter vndb gives it. */
const ID = /^([vrcpsgi])\d+$/
const TYPE = /^([vrcpsgi])$/

function typeOf(slug: string): string | null {
  return ID.exec(slug)?.[1] ?? null
}

export default async function Page({ params, searchParams }: PageProps<"/[slug]">) {
  const { slug } = await params

  if (TYPE.test(slug)) return <ListPage type={slug} params={await searchParams} />

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
    case "r": {
      const release = await byId<ReleaseDetail>("release", slug, RELEASE_PAGE)
      if (!release) notFound()
      return <ReleasePage release={release} />
    }
    default:
      notFound()
  }
}

export async function generateMetadata({ params }: PageProps<"/[slug]">) {
  const { slug } = await params

  if (TYPE.test(slug)) return { title: `${LIST[slug].label} - NeoVNDB` }

  switch (typeOf(slug)) {
    case "v": {
      const vn = await byId<{ title: string | null }>("vn", slug, "title")
      return { title: vn?.title ? `${vn.title} - NeoVNDB` : "NeoVNDB" }
    }
    case "c": {
      const c = await byId<{ name: string | null }>("character", slug, "name")
      return { title: c?.name ? `${c.name} - NeoVNDB` : "NeoVNDB" }
    }
    case "r": {
      const r = await byId<{ title: string | null }>("release", slug, "title")
      return { title: r?.title ? `${r.title} - NeoVNDB` : "NeoVNDB" }
    }
    default:
      return { title: "NeoVNDB" }
  }
}
