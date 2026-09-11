/** What each page asks for. Kept apart from the components so the cost of a
 *  page is one thing to read, and so two pages cannot silently disagree about
 *  what a shared component needs. */

/** The VN page. Grouped the way the page is laid out. */
export const VN_PAGE = [
  // Heading and info panel.
  "title", "alttitle", "olang", "released", "devstatus", "languages", "platforms",
  "aliases", "length", "length_minutes", "length_votes",
  "rating", "average", "votecount", "description",
  "image.url", "image.dims", "image.sexual", "image.violence",
  "developers.name", "developers.original",
  "extlinks.site", "extlinks.label", "extlinks.url",

  // Tags, with the score and spoiler level the page filters on.
  "tags.name", "tags.category", "tags.rating", "tags.spoiler", "tags.lie",

  // Characters. The physical details are all columns on the character row,
  // so asking for them costs the same read as asking for the name.
  "characters.name", "characters.original", "characters.role", "characters.spoiler",
  "characters.sex", "characters.spoil_sex", "characters.gender", "characters.spoil_gender",
  "characters.age", "characters.birthday", "characters.blood_type",
  "characters.height", "characters.weight",
  "characters.bust", "characters.waist", "characters.hips", "characters.cup",
  "characters.description", "characters.image",
  "characters.aliases.name", "characters.aliases.latin", "characters.aliases.spoiler",
  "characters.traits.name", "characters.traits.group_name", "characters.traits.spoiler",
  "characters.seiyuu.name", "characters.seiyuu.note", "characters.seiyuu.vn",

  // Staff, credited under the name used on this work.
  "staff.name", "staff.original", "staff.role", "staff.note",

  // Releases: everything the row's icons are drawn from.
  "releases.title", "releases.released", "releases.rtype", "releases.minage",
  "releases.patch", "releases.official", "releases.freeware", "releases.uncensored",
  "releases.has_ero", "releases.voiced", "releases.resolution", "releases.notes",
  "releases.animation", "releases.platforms", "releases.media", "releases.engine",
  "releases.titles", "releases.drm", "releases.extlinks",
  "releases.producers.name", "releases.producers.original", "releases.producers.lang",
  "releases.producers.developer", "releases.producers.publisher",

  "screenshots.url", "screenshots.thumbnail", "screenshots.dims",
  "screenshots.sexual", "screenshots.violence", "screenshots.release",

  "relations.title", "relations.relation", "relations.official",
].join(",")
