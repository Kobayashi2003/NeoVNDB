/** Rating several at once: one rating for all of them, or none. */
"use client"

import { useState } from "react"
import { Check, Loader2, Star, StarOff, X } from "lucide-react"
import { ActionBar } from "@/components/ui/Selection"

export function RatingsBar({
  chosen,
  pageSize,
  allOnPage,
  busy,
  error,
  onAll,
  onRate,
  onClear,
  onClose,
}: {
  chosen: number
  pageSize: number
  allOnPage: boolean
  busy: boolean
  error: string | null
  onAll: () => void
  onRate: (value: number) => void
  onClear: () => void
  onClose: () => void
}) {
  const [confirming, setConfirming] = useState(false)

  return (
    <ActionBar
      error={error}
      chosen={chosen}
      allOnPage={allOnPage}
      canSelectPage={pageSize > 0 && !busy}
      onAll={onAll}
      onClose={onClose}
    >
      {/* One star for the row rather than one per button: five of them do not
          fit a phone's width beside the rest of the bar. */}
      <div className="flex items-center text-amber-300" role="group" aria-label="Rate them">
        <Star className="mx-1 h-3.5 w-3.5 shrink-0 fill-current" aria-hidden />
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onRate(n)}
            disabled={chosen === 0 || busy}
            aria-label={`Rate them ${n}`}
            className="h-7 w-6 rounded-full text-xs font-semibold tabular-nums sm:w-7 transition-colors hover:bg-white/10 disabled:opacity-40"
          >
            {n}
          </button>
        ))}
      </div>

      {confirming ? (
        <>
          <span className="px-1 text-xs text-muted">Clear?</span>
          <button
            type="button"
            onClick={() => {
              setConfirming(false)
              onClear()
            }}
            disabled={busy}
            aria-label="Yes, clear their ratings"
            className="rounded-full p-2 text-red-400 transition-colors hover:bg-red-500/15 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            aria-label="Keep their ratings"
            className="rounded-full p-2 text-muted transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={chosen === 0 || busy}
          title="Clear their ratings"
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/15 disabled:opacity-40"
        >
          <StarOff className="icon-text h-4 w-4 shrink-0" aria-hidden />
          <span className="hidden sm:inline">Clear</span>
        </button>
      )}
    </ActionBar>
  )
}
