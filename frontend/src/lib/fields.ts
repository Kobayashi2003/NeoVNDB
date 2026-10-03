/** The fields each page requests, kept in one place so a page's cost is easy
 *  to read. */

import { LIST } from "@/lib/list"

export const VN_PAGE = [
  "title", "alttitle", "olang", "released", "devstatus", "languages", "platforms",
  "aliases", "length", "length_minutes", "length_votes",
  "rating", "average", "votecount", "description",
  "image.url", "image.dims", "image.sexual", "image.violence",
  "developers.name", "developers.original",
  "extlinks.site", "extlinks.label", "extlinks.url",

  "anime.id", "anime.type", "anime.year", "anime.title", "anime.original",

  // Tags have no original script; translation.name is what original mode shows.
  "tags.name", "tags.category", "tags.rating", "tags.spoiler", "tags.lie",
  "tags.translation.name",

  "characters.name", "characters.original", "characters.role", "characters.spoiler",
  "characters.sex", "characters.spoil_sex", "characters.gender", "characters.spoil_gender",
  "characters.age", "characters.birthday", "characters.blood_type",
  "characters.height", "characters.weight",
  "characters.bust", "characters.waist", "characters.hips", "characters.cup",
  "characters.description", "characters.image",
  "characters.aliases.name", "characters.aliases.latin", "characters.aliases.spoiler",
  "characters.traits.name", "characters.traits.group_name",
  "characters.traits.spoiler", "characters.traits.lie",
  "characters.traits.translation.name", "characters.traits.group_translation",
  "characters.seiyuu.name", "characters.seiyuu.note", "characters.seiyuu.vn",

  // eid names the edition a credit is for; editions describes it.
  "staff.name", "staff.original", "staff.role", "staff.note", "staff.eid",
  "editions.eid", "editions.name", "editions.lang", "editions.official",

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

  // Drawn as list cards, so asked for with exactly the list's fields.
  ...LIST.v.fields.split(",").map((f) => `similar.${f}`),
  "similar.score",
].join(",")

export const CHARACTER_PAGE = [
  "name", "original", "description",
  "sex", "spoil_sex", "gender", "spoil_gender",
  "age", "birthday", "blood_type", "height", "weight",
  "bust", "waist", "hips", "cup",
  "image.url", "image.dims", "image.sexual", "image.violence",
  "aliases.name", "aliases.latin", "aliases.spoiler",

  "traits.name", "traits.group_name", "traits.spoiler", "traits.lie",
  "traits.translation.name", "traits.group_translation",

  "vns.title", "vns.released", "vns.role", "vns.spoiler", "vns.release",

  "seiyuu.name", "seiyuu.note", "seiyuu.vn",

  "instance_of", "instance_of_spoiler",
  "instances.name", "instances.original", "instances.spoiler",
  "instances.image.url", "instances.image.dims",
  "instances.image.sexual", "instances.image.violence",
].join(",")

/** Read from the group's parent: chars.main points one way, so an instance
 *  does not know its siblings. */
export const INSTANCE_GROUP = [
  "name", "original",
  "image.url", "image.dims", "image.sexual", "image.violence",
  "instances.name", "instances.original", "instances.spoiler",
  "instances.image.url", "instances.image.dims",
  "instances.image.sexual", "instances.image.violence",
].join(",")

export const RELEASE_PAGE = [
  "title", "alttitle", "olang", "released", "minage",
  "patch", "official", "freeware", "uncensored", "has_ero",
  "voiced", "resolution", "notes", "catalog", "gtin", "animation",
  "platforms", "media", "engine",
  "titles",
  "images",
  "drm",
  "extlinks.site", "extlinks.label", "extlinks.url",

  // rtype is per VN: one disc can be complete for one work and a trial of another.
  "vns.title", "vns.rtype",
  "producers.name", "producers.original", "producers.lang",
  "producers.developer", "producers.publisher",
  "supersedes.title",
].join(",")

export const PRODUCER_PAGE = [
  "name", "original", "aliases", "lang", "type", "description",
  "extlinks.site", "extlinks.label", "extlinks.url",
  "relations.name", "relations.original", "relations.relation",
].join(",")

export const STAFF_PAGE = [
  "name", "original", "aid", "lang", "gender", "description",
  "aliases.aid", "aliases.name", "aliases.original", "aliases.ismain",
  "extlinks.site", "extlinks.label", "extlinks.url",
].join(",")

export const TAG_PAGE = [
  "name", "aliases", "description", "category", "searchable", "applicable", "vn_count",
  "translation.name", "translation.description",
  "parents.name", "parents.main", "parents.translation.name",
  "children.name", "children.vn_count", "children.translation.name",
].join(",")

export const TRAIT_PAGE = [
  "name", "aliases", "description", "searchable", "applicable", "sexual", "char_count",
  "group_id", "group_name", "group_translation",
  "translation.name", "translation.description",
  "parents.name", "parents.main", "parents.translation.name",
  "children.name", "children.char_count", "children.translation.name",
].join(",")
