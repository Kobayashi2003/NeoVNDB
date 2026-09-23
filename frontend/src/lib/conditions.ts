/** What the condition builder offers per type. Keys are the backend filters in
 *  api/<type>/filters.go; keep the two in step. The text view accepts any
 *  filter, so a missing entry only means it has no control here. */

import { ENUMS, enumLabel } from "./enums"
import { ICON } from "./icons"
import type { Choice } from "./filters"
import type { Op, TidyRules } from "./expr"

export type ConditionKind =
  | { kind: "enum"; choices: Choice[] }
  | { kind: "bool" }
  | { kind: "number"; hint?: string }
  | { kind: "date" }
  | { kind: "text"; hint?: string }
  /** Matched by id: staff=s8. */
  | { kind: "entity"; target: string }
  /** Tag or trait with optional minimum score and spoiler ceiling. */
  | { kind: "scored"; target: "g" | "i"; score: boolean }
  /** By id, or by a condition on the related type: release=(lang=en). */
  | { kind: "relation"; target: string }

export type Condition = ConditionKind & { key: string; label: string }

export const OP_LABEL: Record<Op, string> = {
  "=": "is",
  "!=": "is not",
  ">=": "≥",
  "<=": "≤",
  ">": ">",
  "<": "<",
}

export function opsFor(c: ConditionKind): Op[] {
  switch (c.kind) {
    case "number":
    case "date":
      return ["=", "!=", ">=", "<=", ">", "<"]
    case "bool":
    case "text":
      return ["="]
    default:
      return ["=", "!="]
  }
}

function from(group: keyof typeof ENUMS, icons?: Record<string, string>): Choice[] {
  return Object.keys(ENUMS[group]).map((value) => ({
    value,
    label: enumLabel(group, value),
    icon: icons?.[value],
  }))
}

const LANG = () => ({ kind: "enum" as const, choices: from("LANGUAGE", ICON.LANGUAGE as Record<string, string>) })
const PLATFORM = () => ({ kind: "enum" as const, choices: from("PLATFORM", ICON.PLATFORM as Record<string, string>) })
const BOOL = { kind: "bool" as const }
const SEARCH = { kind: "text" as const, hint: "words" }
const NUM = { kind: "number" as const }
const on = (target: string) => ({ kind: "entity" as const, target })
const rel = (target: string) => ({ kind: "relation" as const, target })

export const CONDITIONS: Record<string, Condition[]> = {
  v: [
    { key: "search", label: "Title", ...SEARCH },
    { key: "lang", label: "Language", ...LANG() },
    { key: "olang", label: "Original language", ...LANG() },
    { key: "platform", label: "Platform", ...PLATFORM() },
    { key: "length", label: "Length", kind: "enum", choices: from("LENGTH") },
    { key: "devstatus", label: "Status", kind: "enum", choices: from("DEVSTATUS") },
    { key: "released", label: "Released", kind: "date" },
    { key: "rating", label: "Rating", kind: "number", hint: "10–100" },
    { key: "average", label: "Average", kind: "number", hint: "10–100" },
    { key: "votecount", label: "Votes", ...NUM },
    { key: "tag", label: "Tag", kind: "scored", target: "g", score: true },
    { key: "dtag", label: "Tag (not inherited)", kind: "scored", target: "g", score: true },
    { key: "release", label: "Release", ...rel("r") },
    { key: "developer", label: "Developer", ...rel("p") },
    { key: "producer", label: "Producer", ...rel("p") },
    { key: "character", label: "Character", ...rel("c") },
    { key: "trait", label: "Character trait", ...on("i") },
    { key: "staff", label: "Staff", ...on("s") },
    { key: "seiyuu", label: "Voice actor", ...on("s") },
    { key: "medium", label: "Medium", kind: "enum", choices: from("MEDIUM") },
    { key: "has_description", label: "Has description", ...BOOL },
    { key: "has_screenshot", label: "Has screenshots", ...BOOL },
    { key: "has_anime", label: "Has anime", ...BOOL },
  ],
  r: [
    { key: "search", label: "Title", ...SEARCH },
    { key: "lang", label: "Language", ...LANG() },
    { key: "olang", label: "Original language", ...LANG() },
    { key: "platform", label: "Platform", ...PLATFORM() },
    { key: "medium", label: "Medium", kind: "enum", choices: from("MEDIUM") },
    { key: "rtype", label: "Type", kind: "enum", choices: from("RTYPE") },
    { key: "voiced", label: "Voiced", kind: "enum", choices: from("VOICED") },
    { key: "released", label: "Released", kind: "date" },
    { key: "minage", label: "Age rating", ...NUM },
    { key: "engine", label: "Engine", kind: "text", hint: "exact name" },
    { key: "official", label: "Official", ...BOOL },
    { key: "patch", label: "Patch", ...BOOL },
    { key: "freeware", label: "Freeware", ...BOOL },
    { key: "has_ero", label: "Has erotic scenes", ...BOOL },
    { key: "uncensored", label: "Uncensored", ...BOOL },
    { key: "vn", label: "Visual novel", ...rel("v") },
    { key: "producer", label: "Producer", ...rel("p") },
    { key: "developer", label: "Developer", ...rel("p") },
    { key: "publisher", label: "Publisher", ...rel("p") },
    { key: "supersedes", label: "Supersedes", ...on("r") },
  ],
  c: [
    { key: "search", label: "Name", ...SEARCH },
    { key: "role", label: "Role", kind: "enum", choices: from("CHARACTER_ROLE") },
    { key: "sex", label: "Sex", kind: "enum", choices: from("CHARACTER_SEX") },
    { key: "gender", label: "Gender", kind: "enum", choices: from("CHARACTER_SEX") },
    { key: "trait", label: "Trait", kind: "scored", target: "i", score: false },
    { key: "dtrait", label: "Trait (not inherited)", kind: "scored", target: "i", score: false },
    { key: "vn", label: "Visual novel", ...rel("v") },
    { key: "seiyuu", label: "Voice actor", ...on("s") },
    { key: "age", label: "Age", ...NUM },
    { key: "height", label: "Height", kind: "number", hint: "cm" },
    { key: "weight", label: "Weight", kind: "number", hint: "kg" },
    { key: "bust", label: "Bust", kind: "number", hint: "cm" },
    { key: "waist", label: "Waist", kind: "number", hint: "cm" },
    { key: "hips", label: "Hips", kind: "number", hint: "cm" },
    { key: "cup", label: "Cup size", kind: "text", hint: "AAA–Z" },
    {
      key: "blood_type",
      label: "Blood type",
      kind: "enum",
      choices: ["a", "b", "ab", "o"].map((v) => ({ value: v, label: v.toUpperCase() })),
    },
  ],
  p: [
    { key: "search", label: "Name", ...SEARCH },
    { key: "type", label: "Type", kind: "enum", choices: from("TYPE") },
    { key: "lang", label: "Language", ...LANG() },
    { key: "vn", label: "Visual novel", ...on("v") },
    { key: "release", label: "Release", ...on("r") },
    { key: "relation", label: "Related producer", ...on("p") },
  ],
  s: [
    { key: "search", label: "Name", ...SEARCH },
    { key: "role", label: "Role", kind: "enum", choices: from("STAFF_ROLE") },
    { key: "lang", label: "Language", ...LANG() },
    { key: "gender", label: "Gender", kind: "enum", choices: from("CHARACTER_SEX") },
    { key: "vn", label: "Visual novel", ...on("v") },
    { key: "character", label: "Voiced character", ...on("c") },
  ],
  g: [
    { key: "search", label: "Name", ...SEARCH },
    { key: "category", label: "Category", kind: "enum", choices: from("CATEGORY") },
    { key: "vn_count", label: "Visual novels", ...NUM },
    { key: "parent", label: "Parent", ...on("g") },
    { key: "under", label: "Anywhere under", ...on("g") },
    { key: "vn", label: "Visual novel", ...on("v") },
    { key: "searchable", label: "Searchable", ...BOOL },
    { key: "applicable", label: "Applicable", ...BOOL },
  ],
  i: [
    { key: "search", label: "Name", ...SEARCH },
    { key: "char_count", label: "Characters", ...NUM },
    { key: "group", label: "Group", ...on("i") },
    { key: "parent", label: "Parent", ...on("i") },
    { key: "under", label: "Anywhere under", ...on("i") },
    { key: "character", label: "Character", ...on("c") },
    { key: "sexual", label: "Sexual", ...BOOL },
    { key: "searchable", label: "Searchable", ...BOOL },
    { key: "applicable", label: "Applicable", ...BOOL },
  ],
}

export function conditionOf(type: string, key: string): Condition | undefined {
  return CONDITIONS[type]?.find((c) => c.key === key)
}

/** Singular names for "a release that…". */
export const NOUN: Record<string, string> = {
  v: "visual novel",
  r: "release",
  c: "character",
  p: "producer",
  s: "staff member",
  g: "tag",
  i: "trait",
}

/** A tag or trait value: g749, g749:2.0, g749:2.0:1, i568:1. */
export interface Scored {
  id: string
  score: string
  spoiler: string
}

export function readScored(value: string, score: boolean): Scored {
  const [id = "", a = "", b = ""] = value.split(":")
  return score ? { id, score: a, spoiler: b } : { id, score: "", spoiler: a }
}

export function writeScored(v: Scored, score: boolean): string {
  if (!v.id) return ""
  if (!score) return v.spoiler ? `${v.id}:${v.spoiler}` : v.id
  // Direct tag scores are always positive, so 0 stands in for "any score".
  if (v.spoiler) return `${v.id}:${v.score || "0"}:${v.spoiler}`
  return v.score ? `${v.id}:${v.score}` : v.id
}

/** Kinds whose backend filter reads a comma list as "any of". Scored values
 *  carry their own colon syntax per item, so they are left alone. */
const LISTABLE = new Set(["enum", "entity", "relation", "number", "date"])

export const TIDY_RULES: TidyRules = {
  mergeable: (type, name) => LISTABLE.has(conditionOf(type, name)?.kind ?? ""),
  nested: (type, name) => {
    const c = conditionOf(type, name)
    return c?.kind === "relation" ? c.target : undefined
  },
}
