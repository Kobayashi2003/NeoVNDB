/** The way in.
 *
 *  What this holds, and how much of it. The counts are the point: they say the
 *  mirror is real and how far along it is, which is the one thing a landing
 *  page here can tell a reader that a list of links cannot. */

import Link from "next/link"
import { countOf } from "@/lib/results"
import { LIST } from "@/lib/list"

const TYPES = ["v", "c", "r", "p", "s", "g", "i"] as const

/** What each kind of thing is, for a reader who has not used vndb. */
const ABOUT: Record<string, string> = {
  v: "The works themselves",
  c: "Everyone who appears in them",
  r: "Each edition, port and translation",
  p: "The companies and circles behind them",
  s: "Writers, artists, composers, voice actors",
  g: "What a work is about",
  i: "What a character is like",
}

export default async function Home() {
  // One cheap count each, asked for together rather than in turn.
  const counts = await Promise.all(TYPES.map((t) => countOf(t, {})))

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-10 animate-slide-up-fade">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">NeoVNDB</h1>
        <p className="mt-1 text-sm text-muted">
          A local mirror of vndb&apos;s public dump, and a way to read it.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TYPES.map((type, i) => (
          <Link
            key={type}
            href={`/${type}`}
            // min-w-0 on the grid item itself: a track sized `auto` takes the
            // item's min-content as its floor, and the nowrap description
            // inside makes that wider than a phone.
            className="flex min-w-0 items-baseline justify-between gap-3 rounded-lg border border-white/5 bg-surface px-4 py-3 transition-colors hover:border-white/20"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{LIST[type].label}</span>
              <span className="block truncate text-xs text-muted">{ABOUT[type]}</span>
            </span>
            <span className="shrink-0 text-sm tabular-nums text-accent">
              {counts[i].toLocaleString()}
            </span>
          </Link>
        ))}
      </div>
    </main>
  )
}
