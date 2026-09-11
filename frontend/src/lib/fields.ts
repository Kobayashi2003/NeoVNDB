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
  "characters.traits.name", "characters.traits.group_name",
  "characters.traits.spoiler", "characters.traits.lie",
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

/** The character page. A character read on its own carries more than one read
 *  through a visual novel: the works are the subject rather than the context,
 *  and the instance group only makes sense here. */
export const CHARACTER_PAGE = [
  "name", "original", "description",
  "sex", "spoil_sex", "gender", "spoil_gender",
  "age", "birthday", "blood_type", "height", "weight",
  "bust", "waist", "hips", "cup",
  "image.url", "image.dims", "image.sexual", "image.violence",
  "aliases.name", "aliases.latin", "aliases.spoiler",

  "traits.name", "traits.group_name", "traits.spoiler", "traits.lie",

  // Appearances. released comes from the visual novel itself, which is what
  // the list offers to sort by.
  "vns.title", "vns.released", "vns.role", "vns.spoiler", "vns.release",

  // Who voiced this character, and in which work -- the page hangs each
  // credit off the appearance it belongs to.
  "seiyuu.name", "seiyuu.note", "seiyuu.vn",

  // The instance group, read from whichever end this character sits at.
  "instance_of", "instance_of_spoiler",
  "instances.name", "instances.original", "instances.spoiler",
  "instances.image.url", "instances.image.dims",
  "instances.image.sexual", "instances.image.violence",
].join(",")

/** A parent character read only for its instance group. An instance's
 *  siblings are not on the instance -- chars.main points one way -- so the
 *  page reads them from the character at the top of the group. */
export const INSTANCE_GROUP = [
  "name", "original",
  "image.url", "image.dims", "image.sexual", "image.violence",
  "instances.name", "instances.original", "instances.spoiler",
  "instances.image.url", "instances.image.dims",
  "instances.image.sexual", "instances.image.violence",
].join(",")

/** The release page. A release read on its own is the packaging rather than
 *  the work: what is in the box, who put it there, and in what shape. */
export const RELEASE_PAGE = [
  "title", "alttitle", "olang", "released", "minage",
  "patch", "official", "freeware", "uncensored", "has_ero",
  "voiced", "resolution", "notes", "catalog", "gtin", "animation",
  "platforms", "media", "engine",
  "titles",
  "images",
  "drm",
  "extlinks.site", "extlinks.label", "extlinks.url",

  // rtype is on the link, not on the release: one disc can be a complete
  // edition of one work and a trial of another.
  "vns.title", "vns.rtype",
  "producers.name", "producers.original", "producers.lang",
  "producers.developer", "producers.publisher",
  "supersedes.title",
].join(",")
