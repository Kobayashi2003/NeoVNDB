/** Small pieces the builder's popovers share. */
"use client"

import { Search, X } from "lucide-react"
import { menuItem } from "@/components/ui/Menu"

export const INPUT =
  "rounded-lg border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-xs text-white outline-none [color-scheme:dark] placeholder:text-muted focus:border-white/30"

export function SearchBox({
  value,
  onChange,
  label,
  onEnter,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  onEnter: () => void
}) {
  return (
    <div className="mx-1 mb-1 flex items-center gap-2 rounded-lg bg-white/[0.06] px-2.5 py-1.5">
      <Search className="icon-text size-3.5 shrink-0 text-muted" aria-hidden />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return
          e.preventDefault()
          onEnter()
        }}
        placeholder={`${label}…`}
        aria-label={label}
        className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted"
      />
    </div>
  )
}

export function DoneButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="self-end rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-40"
    >
      Done
    </button>
  )
}

export function RemoveItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="-mx-1 my-1 h-px bg-white/10" role="separator" />
      <button type="button" onClick={onClick} className={menuItem({ className: "text-red-300 hover:text-red-200" })}>
        <X className="icon-text size-3.5" aria-hidden />
        {children}
      </button>
    </>
  )
}

export function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="icon-text flex size-5 shrink-0 items-center justify-center rounded-full opacity-60 transition-opacity hover:bg-white/10 hover:opacity-100"
    >
      <X className="size-3" aria-hidden />
    </button>
  )
}
