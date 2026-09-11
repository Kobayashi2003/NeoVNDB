/** Releases grouped by language, the way vndb groups them. Every group but the
 *  VN's own language starts collapsed: a long-running title can carry sixty
 *  releases and a reader almost always wants one language at a time. */
"use client"

import { useState } from "react"
import { ICON } from "@/lib/icons"
import { enumLabel } from "@/lib/enums"
import { ChevronRight } from "lucide-react"
import { Icon } from "@/components/ui/Icon"
import { ReleaseRow } from "./ReleaseRow"
import type { Release } from "@/lib/types"

const LANG = ICON.LANGUAGE as Record<string, string>
const UNKNOWN = "__none__"

/** A release is listed under every language it was published in, which is how
 *  vndb lists a bilingual release twice. */
function group(releases: Release[]): Map<string, Release[]> {
  const groups = new Map<string, Release[]>()
  for (const r of releases) {
    const langs = r.titles.length ? r.titles.map((t) => t.lang) : [UNKNOWN]
    for (const lang of langs) {
      const list = groups.get(lang) ?? []
      list.push(r)
      groups.set(lang, list)
    }
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.released.localeCompare(b.released))
  }
  return groups
}

export function VNReleases({ releases, olang }: { releases: Release[]; olang: string }) {
  const groups = group(releases)
  const [open, setOpen] = useState<Set<string>>(() => new Set([olang]))

  const toggle = (lang: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(lang)) next.delete(lang)
      else next.add(lang)
      return next
    })

  const order = [...groups.keys()].sort((a, b) =>
    a === olang ? -1 : b === olang ? 1 : a.localeCompare(b),
  )

  return (
    <div className="flex flex-col gap-2">
      {order.map((lang) => {
        const list = groups.get(lang)!
        const isOpen = open.has(lang)
        return (
          <div key={lang} className="overflow-hidden rounded-lg border border-white/5 bg-surface">
            <button
              onClick={() => toggle(lang)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-white/5"
              aria-expanded={isOpen}
            >
              <ChevronRight
                className={`h-4 w-4 shrink-0 text-muted transition-transform ${
                  isOpen ? "rotate-90" : ""
                }`}
                aria-hidden
              />
              {lang !== UNKNOWN && (
                <Icon cls={LANG[lang] ?? ""} title={enumLabel("LANGUAGE", lang)} />
              )}
              <span className="text-xs font-semibold uppercase tracking-wider">
                {lang === UNKNOWN ? "Unknown language" : enumLabel("LANGUAGE", lang)}
              </span>
              <span className="text-xs text-muted">{list.length}</span>
            </button>
            {isOpen &&
              list.map((r, i) => (
                <ReleaseRow key={`${lang}-${r.id}`} release={r} striped={i % 2 === 1} />
              ))}
          </div>
        )
      })}
    </div>
  )
}
