import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  CONDITIONS,
  asExpression,
  conditionOf,
  opsFor,
  readCredit,
  readScored,
  relatedSearch,
  relatedType,
  TIDY_RULES,
  writeCredit,
  writeScored,
} from "@/lib/conditions"
import { parse, print, tidy } from "@/lib/expr"

// Where each type's filters are declared on the backend.
const BACKEND: Record<string, string> = {
  v: "vn",
  r: "release",
  c: "character",
  p: "producer",
  s: "staff",
  g: "tag",
  i: "trait",
}

describe("CONDITIONS", () => {
  // conditions.ts mirrors api/<type>/filters.go by hand; a key the backend
  // does not have would reach it as an "unknown filter" 400.
  it.each(Object.keys(CONDITIONS))("%s only names filters the backend has", (type) => {
    const file = fileURLToPath(new URL(`../../../backend/vndb/internal/api/${BACKEND[type]}/filters.go`, import.meta.url))
    const source = readFileSync(file, "utf8")
    // Only the filter table: the sort table in the same file shares names.
    const start = source.indexOf("var filters = map[string]query.FilterFunc{")
    expect(start).toBeGreaterThan(-1)
    const table = source.slice(start, source.indexOf("\n}\n", start))
    const missing = CONDITIONS[type]
      .map((c) => c.key)
      .filter((key) => key !== "search" && !table.includes(`"${key}":`))
    expect(missing).toEqual([])
  })

  it("has no duplicate keys within a type", () => {
    for (const [type, list] of Object.entries(CONDITIONS)) {
      const keys = list.map((c) => c.key)
      expect(new Set(keys).size, type).toBe(keys.length)
    }
  })

  it("points related conditions at types that exist", () => {
    for (const list of Object.values(CONDITIONS)) {
      for (const c of list) {
        const target = relatedType(c)
        if (target) expect(CONDITIONS[target], `${c.key} → ${target}`).toBeDefined()
      }
    }
  })
})

describe("opsFor", () => {
  it("compares only what has an order", () => {
    expect(opsFor({ kind: "enum", choices: [] })).toEqual(["=", "!="])
    expect(opsFor({ kind: "enum", choices: [], ordered: true })).toEqual(["=", "!=", ">=", "<="])
    expect(opsFor({ kind: "resolution" })).toEqual(["=", "!=", ">=", "<="])
    expect(opsFor({ kind: "bool" })).toEqual(["="])
    expect(opsFor({ kind: "number" })).toContain(">")
  })
})

describe("value codecs", () => {
  it.each([
    ["g749", true, { id: "g749", score: "", spoiler: "" }],
    ["g749:2.0", true, { id: "g749", score: "2.0", spoiler: "" }],
    ["g749:0:1", true, { id: "g749", score: "0", spoiler: "1" }],
    ["i568:1", false, { id: "i568", score: "", spoiler: "1" }],
  ] as const)("scored %s round-trips", (value, score, parts) => {
    expect(readScored(value, score)).toEqual(parts)
    expect(writeScored(parts, score)).toBe(value)
  })

  it("writes a spoiler ceiling without a score as score 0", () => {
    expect(writeScored({ id: "g1", score: "", spoiler: "2" }, true)).toBe("g1:0:2")
    expect(writeScored({ id: "", score: "1", spoiler: "" }, true)).toBe("")
  })

  it("round-trips credits", () => {
    expect(readCredit("s224:scenario")).toEqual({ id: "s224", role: "scenario" })
    expect(writeCredit({ id: "s224", role: "" })).toBe("s224")
    expect(writeCredit({ id: "", role: "music" })).toBe("")
  })
})

describe("expressions from the catalog", () => {
  it("merges only filters the backend reads as lists", () => {
    const t = (s: string) => print(tidy(parse(s), "v", TIDY_RULES))
    expect(t("lang=en,lang=ja")).toBe('lang="en,ja"')
    expect(t("search=a,search=b")).toBe("search=a,search=b")
    expect(t("release=(platform=win,platform=lin)")).toBe('release=(platform="win,lin")')
  })

  it("quotes values that carry grammar", () => {
    expect(asExpression({ lang: "en", search: "a,b" })).toBe('lang=en+search="a,b"')
    expect(relatedSearch("developer", "key")).toBe("developer=(search=key)")
  })

  it("looks conditions up by type and key", () => {
    expect(conditionOf("r", "resolution")?.kind).toBe("resolution")
    expect(conditionOf("r", "nosuch")).toBeUndefined()
  })
})
