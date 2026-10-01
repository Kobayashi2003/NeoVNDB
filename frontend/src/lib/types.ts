/** Response shapes for the fields in lib/fields.ts. A field absent from the
 *  selection is absent from the object, so these describe one page's request
 *  rather than everything the type can carry. */

export interface Image {
  url: string
  dims: [number, number]
  /** 0 to 2, or null when nobody has voted. */
  sexual: number | null
  violence: number | null
}

export interface ExtLink {
  site: string
  label: string
  url: string
}

/** Tag/trait text in the translated language; vndb has English only, so this
 *  is what original-text mode shows. Null until supplied. */
export interface Translation {
  lang: string
  name?: string | null
  description?: string | null
}

export interface Tag {
  id: string
  name: string
  translation: Translation | null
  category: "cont" | "ero" | "tech" | string
  /** 0 to 3. */
  rating: number
  /** 0 none, 1 minor, 2 major. */
  spoiler: number
  lie: boolean
}

export interface Trait {
  id: string
  name: string
  translation: Translation | null
  group_name: string | null
  group_translation: string | null
  spoiler: number
  /** Flagged untrue; shown struck through. */
  lie: boolean
}

export interface Seiyuu {
  id: string
  /** The alias credited for this voice role, not the person's own name. */
  name: string
  note: string | null
  /** The VN this credit is for; characters carry credits from every work. */
  vn: string
}

export interface CharacterAlias {
  name: string
  latin: string | null
  spoiler: number
}

export interface Character {
  id: string
  name: string
  original: string | null
  /** main, primary, side or appears. */
  role: string
  spoiler: number
  /** Apparent; `spoil_sex` is what they turn out to be. Same for gender. */
  sex: string | null
  spoil_sex: string | null
  gender: string | null
  spoil_gender: string | null
  age: number | null
  /** Month and day; vndb records no year. */
  birthday: [number, number] | null
  blood_type: string | null
  height: number | null
  weight: number | null
  bust: number | null
  waist: number | null
  hips: number | null
  cup: string | null
  description: string | null
  /** Whether being an instance of `instance_of` is itself a spoiler. */
  instance_of: string | null
  instance_of_spoiler: number
  aliases: CharacterAlias[]
  image: Image | null
  traits: Trait[]
  seiyuu: Seiyuu[]
}

export interface Appearance {
  id: string
  title: string
  released: string
  /** main, primary, side or appears. */
  role: string
  spoiler: number
  /** Set when the appearance is route-specific rather than across the work. */
  release: string | null
}

/** Another character filed as an instance of this one, or the reverse. */
export interface Instance {
  id: string
  name: string
  original: string | null
  image: Image | null
  /** Whether the link itself is a spoiler. */
  spoiler: number
}

export interface CharacterDetail extends Character {
  vns: Appearance[]
  instances: Instance[]
}

export interface StaffCredit {
  id: string
  /** The name credited on this work, which may be a pen name. */
  name: string
  original: string | null
  role: string
  note: string | null
  /** An Edition's eid on the same VN; null is the work itself. */
  eid: number | null
}

/** A named version of a work (port, edition, translation). */
export interface Edition {
  eid: number
  name: string
  /** The language the edition is in, where that is what sets it apart. */
  lang: string | null
  official: boolean
}

export interface Anime {
  id: number
  type: string | null
  year: number | null
  title: string
  original: string | null
}

export interface Medium {
  medium: string
  qty: number
}

export interface AnimationKind {
  kind: string
  frequency?: string | null
}

export interface Animation {
  story: { overall: number | null; sprites: AnimationKind | null; cg: AnimationKind | null }
  ero: { overall: number | null; sprites: AnimationKind | null; cg: AnimationKind | null }
  cutscene: AnimationKind | null
  background: boolean
  face: boolean
}

export interface ReleaseTitle {
  lang: string
  title: string | null
  latin: string | null
  mtl: boolean
}

export interface Drm {
  id: number
  name: string
  description: string | null
  notes: string | null
  properties: string[]
}

export interface Release {
  id: string
  title: string | null
  released: string
  /** complete, partial or trial, as this VN records it. */
  rtype: string
  minage: number | null
  patch: boolean
  official: boolean
  freeware: boolean
  uncensored: boolean
  has_ero: boolean
  voiced: number | null
  resolution: string | null
  notes: string | null
  animation: Animation
  platforms: string[]
  media: Medium[]
  engine: { id: number; name: string; description: string | null } | null
  titles: ReleaseTitle[]
  drm: Drm[]
  extlinks: ExtLink[]
  producers: ReleaseProducer[]
}

export interface ReleaseDetail extends Release {
  alttitle: string | null
  olang: string
  catalog: string | null
  gtin: string | null
  images: ReleaseImage[]
  vns: ReleasedVN[]
  supersedes: { id: string; title: string }[]
}

/** Package scans or store art; cover-kind, so one size only. */
export interface ReleaseImage {
  url: string
  dims: [number, number]
  /** dig, pkgfront, pkgback, pkgcontent, pkgside or pkgmed. */
  itype: string
  /** Which work the picture belongs to, when the release carries several. */
  vn: string | null
  languages: string[]
  sexual: number | null
  violence: number | null
}

/** rtype is per VN: a disc can be complete for one work and a trial of another. */
export interface ReleasedVN {
  id: string
  title: string
  rtype: string
}

export interface Screenshot {
  url: string
  /** dims applies to both; the aspect ratio is kept. */
  thumbnail: string
  dims: [number, number]
  sexual: number | null
  violence: number | null
  release: string | null
}

export interface Relation {
  id: string
  title: string
  relation: string
  official: boolean
}

export interface Producer {
  id: string
  name: string
  original: string | null
  lang?: string
}

/** A producer as one release credits them. A company can be both. */
export interface ReleaseProducer extends Producer {
  developer: boolean
  publisher: boolean
}

export interface VN {
  id: string
  title: string | null
  alttitle: string | null
  olang: string
  released: string
  devstatus: number
  languages: string[]
  platforms: string[]
  aliases: string[]
  length: number | null
  length_minutes: number | null
  length_votes: number
  /** Both are 10 to 100, or null with too few votes. */
  rating: number | null
  average: number | null
  votecount: number
  description: string | null
  image: Image | null
  developers: Producer[]
  extlinks: ExtLink[]
  tags: Tag[]
  characters: Character[]
  staff: StaffCredit[]
  editions: Edition[]
  anime: Anime[]
  releases: Release[]
  screenshots: Screenshot[]
  relations: Relation[]
}

/* ─── List rows ─────────────────────────────────────────────────────────── */

/** An id a reader saved that the mirror no longer has: vndb hid or deleted
 *  the entry. It stands in a list so it can still be seen and removed. */
export interface GoneRow {
  id: string
  gone: true
}

export function isGone(row: unknown): row is GoneRow {
  return (row as GoneRow).gone === true
}

export interface VNRow {
  id: string
  title: string | null
  alttitle: string | null
  released: string
  rating: number | null
  votecount: number
  languages: string[]
  platforms: string[]
  devstatus: number
  image: Image | null
}

export interface CharacterRow {
  id: string
  name: string
  original: string | null
  sex: string | null
  image: Image | null
}

export interface ReleaseRow {
  id: string
  title: string | null
  released: string
  minage: number | null
  platforms: string[]
  official: boolean
  patch: boolean
  freeware: boolean
}

export interface ProducerRow {
  id: string
  name: string
  original: string | null
  lang: string
  type: string
}

export interface StaffRow {
  id: string
  name: string
  original: string | null
  lang: string
  gender: string | null
}

export interface TagRow {
  id: string
  name: string
  translation: Translation | null
  category: string
  description: string | null
  vn_count: number
}

export interface TraitRow {
  id: string
  name: string
  translation: Translation | null
  group_name: string | null
  group_translation: string | null
  description: string | null
  char_count: number
  sexual: boolean
}

/* ─── Catalogue entities ────────────────────────────────────────────────── */

export interface ProducerDetail {
  id: string
  name: string
  original: string | null
  aliases: string[]
  lang: string
  type: string
  description: string | null
  extlinks: ExtLink[]
  relations: { id: string; name: string; original: string | null; relation: string }[]
}

export interface StaffAlias {
  aid: number
  name: string
  original: string | null
  /** True for the alias that is the person's own name. */
  ismain: boolean
}

export interface StaffDetail {
  id: string
  name: string
  original: string | null
  /** The alias id of the person's own name, which is what a credit points at. */
  aid: number
  lang: string
  gender: string | null
  description: string | null
  aliases: StaffAlias[]
  extlinks: ExtLink[]
}

export interface TagDetail {
  id: string
  name: string
  translation: Translation | null
  aliases: string[]
  description: string | null
  category: string
  searchable: boolean
  applicable: boolean
  vn_count: number
  parents: { id: string; name: string; main: boolean; translation: Translation | null }[]
  children: { id: string; name: string; vn_count: number; translation: Translation | null }[]
}

export interface TraitDetail {
  id: string
  name: string
  translation: Translation | null
  aliases: string[]
  description: string | null
  searchable: boolean
  applicable: boolean
  sexual: boolean
  char_count: number
  group_id: string | null
  group_name: string | null
  group_translation: string | null
  parents: { id: string; name: string; main: boolean; translation: Translation | null }[]
  children: { id: string; name: string; char_count: number; translation: Translation | null }[]
}
