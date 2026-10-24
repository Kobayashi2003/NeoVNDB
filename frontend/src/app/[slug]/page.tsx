/** Entities live at their id under the root (/v17), types at their letter
 *  (/v). Static routes such as /q take precedence over this catch-all. */

import { notFound } from 'next/navigation';
import { byId } from '@/lib/api';
import {
  CHARACTER_PAGE,
  INSTANCE_GROUP,
  PRODUCER_PAGE,
  RELEASE_PAGE,
  STAFF_PAGE,
  TAG_PAGE,
  TRAIT_PAGE,
  VN_PAGE,
} from '@/lib/fields';
import { LIST } from '@/lib/list';
import { ListPage } from '@/components/list/ListPage';
import { VNPage } from '@/components/vn/VNPage';
import { CharacterPage } from '@/components/character/CharacterPage';
import { ReleasePage } from '@/components/release/ReleasePage';
import { ProducerPage } from '@/components/catalog/ProducerPage';
import { StaffPage } from '@/components/catalog/StaffPage';
import { TagPage } from '@/components/catalog/TagPage';
import { TraitPage } from '@/components/catalog/TraitPage';
import type {
  CharacterDetail,
  Instance,
  ProducerDetail,
  ReleaseDetail,
  StaffDetail,
  TagDetail,
  TraitDetail,
  VN,
} from '@/lib/types';

/** The seven types the dump carries, each with the letter vndb gives it. */
const ID = /^([vrcpsgi])\d+$/;
const TYPE = /^([vrcpsgi])$/;

function typeOf(slug: string): string | null {
  return ID.exec(slug)?.[1] ?? null;
}

export default async function Page({ params, searchParams }: PageProps<'/[slug]'>) {
  const { slug } = await params;
  const query = await searchParams;

  if (TYPE.test(slug)) return <ListPage type={slug} params={query} />;

  switch (typeOf(slug)) {
    case 'v': {
      const vn = await byId<VN>('vn', slug, VN_PAGE);
      if (!vn) notFound();
      return <VNPage vn={vn} />;
    }
    case 'c': {
      const character = await byId<CharacterDetail>('character', slug, CHARACTER_PAGE);
      if (!character) notFound();
      // chars.main points from an instance to its parent and no further, so a
      // character in the middle of a group has to ask the top of it for the
      // rest -- one extra read, and only for the pages that need it.
      const top = character.instance_of
        ? await byId<{
            name: string;
            original: string | null;
            image: Instance['image'];
            instances: Instance[];
          }>('character', character.instance_of, INSTANCE_GROUP)
        : null;
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
        : null;
      return <CharacterPage character={character} parent={parent} />;
    }
    case 'r': {
      const release = await byId<ReleaseDetail>('release', slug, RELEASE_PAGE);
      if (!release) notFound();
      return <ReleasePage release={release} />;
    }
    case 'p': {
      const producer = await byId<ProducerDetail>('producer', slug, PRODUCER_PAGE);
      if (!producer) notFound();
      return <ProducerPage producer={producer} params={query} />;
    }
    case 's': {
      const staff = await byId<StaffDetail>('staff', slug, STAFF_PAGE);
      if (!staff) notFound();
      return <StaffPage staff={staff} params={query} />;
    }
    case 'g': {
      const tag = await byId<TagDetail>('tag', slug, TAG_PAGE);
      if (!tag) notFound();
      return <TagPage tag={tag} params={query} />;
    }
    case 'i': {
      const trait = await byId<TraitDetail>('trait', slug, TRAIT_PAGE);
      if (!trait) notFound();
      return <TraitPage trait={trait} params={query} />;
    }
    default:
      notFound();
  }
}

/** The page's own fields, so this asks exactly what the page does: Next then
 *  makes the two one request rather than reading the entity twice. */
const PAGE: Record<string, { type: string; fields: string }> = {
  v: { type: 'vn', fields: VN_PAGE },
  c: { type: 'character', fields: CHARACTER_PAGE },
  r: { type: 'release', fields: RELEASE_PAGE },
  p: { type: 'producer', fields: PRODUCER_PAGE },
  s: { type: 'staff', fields: STAFF_PAGE },
  g: { type: 'tag', fields: TAG_PAGE },
  i: { type: 'trait', fields: TRAIT_PAGE },
};

export async function generateMetadata({ params }: PageProps<'/[slug]'>) {
  const { slug } = await params;

  if (TYPE.test(slug)) return { title: `${LIST[slug].label} - NeoVNDB` };

  const letter = typeOf(slug);
  if (!letter) return { title: 'NeoVNDB' };
  const { type, fields } = PAGE[letter];
  const e = await byId<{ title?: string | null; name?: string | null }>(type, slug, fields);
  const name = e?.title ?? e?.name;
  return { title: name ? `${name} - NeoVNDB` : 'NeoVNDB' };
}
