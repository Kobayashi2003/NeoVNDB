/** What a reader can do to a handful of things at once, and the box they tick
 *  to choose them.
 *
 *  The bar is pinned to the bottom of the window rather than put at the top of
 *  the list, because the selecting happens down among the cards and a control
 *  that scrolls away is one the reader has to go back for. It exists only
 *  while selecting, so it is never in the way of reading. */
"use client"

import { useState } from "react"
import { Check, CheckSquare, FolderInput, Loader2, Square, Trash2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Collection } from "@/lib/user"
import { useDismiss } from "@/hooks/useDismiss"
import { useKeptOnScreen } from "@/hooks/useKeptOnScreen"

/** One card with a box on it. The card itself stops taking clicks: in this
 *  mode every click on it means "this one", not "take me to it".
 *
 *  A tile has a picture the box can sit on top of. A row has nothing to spare
 *  -- its own icon is already at the left -- so the row is indented instead and
 *  the box goes in the space that makes. */
export function Selectable({
  on,
  grid,
  onToggle,
  children,
}: {
  on: boolean
  grid: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "relative rounded-lg transition-shadow",
        !grid && "pl-9",
        on && "ring-2 ring-accent ring-offset-2 ring-offset-background",
      )}
    >
      <div className="pointer-events-none">{children}</div>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        className="absolute inset-0 cursor-pointer rounded-lg"
      >
        <span
          className={cn(
            "absolute flex h-5 w-5 items-center justify-center rounded border transition-colors",
            grid ? "left-2 top-2" : "left-2 top-1/2 -translate-y-1/2",
            on ? "border-accent bg-accent" : "border-white/40 bg-background/70",
          )}
        >
          {on && <Check className="h-3.5 w-3.5 text-background" strokeWidth={4} aria-hidden />}
        </span>
        <span className="sr-only">{on ? "Deselect" : "Select"}</span>
      </button>
    </div>
  )
}

export function SelectBar({
  chosen,
  pageSize,
  allOnPage,
  lists,
  busy,
  error,
  onAll,
  onMove,
  onRemove,
  onClose,
}: {
  chosen: number
  pageSize: number
  allOnPage: boolean
  /** Where a move could go: the reader's other lists of this same kind. */
  lists: Collection[]
  busy: boolean
  error: string | null
  onAll: () => void
  onMove: (to: number) => void
  onRemove: () => void
  onClose: () => void
}) {
  const [picking, setPicking] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const box = useDismiss<HTMLDivElement>(picking, () => setPicking(false))
  const menu = useKeptOnScreen<HTMLDivElement>(picking)

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-3">
      <div className="pointer-events-auto flex max-w-full flex-col gap-1 rounded-2xl border border-white/15 bg-[var(--overlay)] p-1.5 shadow-2xl shadow-black/60 animate-slide-up-fade">
        {error && (
          <p role="alert" className="px-2 pt-1 text-xs text-red-400">
            {error}
          </p>
        )}

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onAll}
            disabled={pageSize === 0 || busy}
            title={allOnPage ? "Deselect this page" : "Select this page"}
            aria-label={allOnPage ? "Deselect this page" : "Select this page"}
            className="rounded-full p-2 transition-colors hover:bg-white/10 disabled:opacity-40"
          >
            {allOnPage ? (
              <CheckSquare className="h-4 w-4 text-accent" aria-hidden />
            ) : (
              <Square className="h-4 w-4" aria-hidden />
            )}
          </button>

          <span className="min-w-20 select-none px-1 text-center text-xs font-medium tabular-nums">
            {chosen} selected
          </span>

          <span className="mx-0.5 h-6 w-px bg-white/15" aria-hidden />

          <div ref={box} className="relative">
            <button
              type="button"
              onClick={() => setPicking((o) => !o)}
              disabled={chosen === 0 || busy || lists.length === 0}
              aria-expanded={picking}
              title={lists.length === 0 ? "No other list of this kind" : "Move to another list"}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors hover:bg-white/10 disabled:opacity-40"
            >
              <FolderInput className="h-4 w-4 shrink-0" aria-hidden />
              <span className="hidden sm:inline">Move</span>
            </button>

            {picking && (
              <div
                ref={menu}
                className="absolute bottom-full left-0 z-30 mb-2 max-h-64 w-56 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-lg border border-white/10 bg-[var(--overlay)] p-1 shadow-xl"
              >
                {lists.map((list) => (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => {
                      setPicking(false)
                      onMove(list.id)
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-white/10"
                  >
                    <span className="min-w-0 flex-1 truncate">{list.name}</span>
                    <span className="shrink-0 tabular-nums text-muted">{list.count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {confirming ? (
            // Asked in place, like deleting a list is. What goes is only a
            // mark, but it is still a thing the reader chose to keep.
            <>
              <span className="px-1 text-xs text-muted">Remove?</span>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false)
                  onRemove()
                }}
                disabled={busy}
                aria-label="Yes, remove them"
                className="rounded-full p-2 text-red-400 transition-colors hover:bg-red-500/15 disabled:opacity-40"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Check className="h-4 w-4" aria-hidden />
                )}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                aria-label="Keep them"
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
              title="Remove from this list"
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/15 disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
              <span className="hidden sm:inline">Remove</span>
            </button>
          )}

          <span className="mx-0.5 h-6 w-px bg-white/15" aria-hidden />

          <button
            type="button"
            onClick={onClose}
            aria-label="Done selecting"
            title="Done selecting"
            className="rounded-full p-2 text-muted transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  )
}
