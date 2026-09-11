/** What each type's list page asks for and offers to sort by.
 *
 *  One table rather than seven pages, for the same reason the backend declares
 *  a field table per type instead of scattering the knowledge: the cost of a
 *  listing and the orders it offers are two things a reader compares across
 *  types, so they should be readable in one place.
 *
 *  Every sort named here exists on the matching backend type. `searchrank` is
 *  left out on purpose -- it only means anything with a search term, and the
 *  page picks it up on its own when there is one. */

export interface Sort {
  value: string
  label: string
  /** True when the interesting end is the high one, so the first click on it
   *  should read downwards: nobody wants the worst-rated visual novels. */
  descending?: boolean
}

export interface ListSpec {
  /** The API endpoint, which is the type's own name. */
  type: string
  /** Plural, for the heading. */
  label: string
  fields: string
  sorts: Sort[]
  defaultSort: string
}

const BY_NAME: Sort = { value: "name", label: "Name" }
const BY_TITLE: Sort = { value: "title", label: "Title" }

export const LIST: Record<string, ListSpec> = {
  v: {
    type: "vn",
    label: "Visual Novels",
    fields: [
      "title", "alttitle", "released", "rating", "votecount",
      "languages", "platforms", "devstatus",
      "image.url", "image.dims", "image.sexual", "image.violence",
    ].join(","),
    sorts: [
      BY_TITLE,
      { value: "released", label: "Release date", descending: true },
      { value: "rating", label: "Rating", descending: true },
      { value: "votecount", label: "Votes", descending: true },
      { value: "length_minutes", label: "Length" },
    ],
    defaultSort: "rating",
  },
  c: {
    type: "character",
    label: "Characters",
    fields: [
      "name", "original", "sex",
      "image.url", "image.dims", "image.sexual", "image.violence",
    ].join(","),
    sorts: [BY_NAME, { value: "age", label: "Age" }, { value: "height", label: "Height" }],
    defaultSort: "name",
  },
  r: {
    type: "release",
    label: "Releases",
    fields: ["title", "released", "minage", "platforms", "official", "patch", "freeware"].join(","),
    sorts: [BY_TITLE, { value: "released", label: "Release date", descending: true }],
    defaultSort: "released",
  },
  p: {
    type: "producer",
    label: "Producers",
    fields: ["name", "original", "lang", "type"].join(","),
    sorts: [BY_NAME],
    defaultSort: "name",
  },
  s: {
    type: "staff",
    label: "Staff",
    fields: ["name", "original", "lang", "gender"].join(","),
    sorts: [BY_NAME],
    defaultSort: "name",
  },
  g: {
    type: "tag",
    label: "Tags",
    fields: ["name", "category", "description", "vn_count"].join(","),
    sorts: [BY_NAME, { value: "vn_count", label: "Visual novels", descending: true }],
    defaultSort: "vn_count",
  },
  i: {
    type: "trait",
    label: "Traits",
    fields: ["name", "group_name", "description", "char_count", "sexual"].join(","),
    sorts: [BY_NAME, { value: "char_count", label: "Characters", descending: true }],
    defaultSort: "char_count",
  },
}

/** How many results one page shows. Small enough that a page of visual novels
 *  with covers is not a megabyte, large enough to be worth paging. */
export const PAGE_SIZE = 24
