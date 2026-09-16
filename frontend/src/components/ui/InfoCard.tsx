/** The card surface every sidebar panel sits on, and the rows that go in it. */

import { cn } from "@/lib/utils"

/** `padding="rows"` suits a stack of InfoRows, which carry their own vertical
 *  padding; `"block"` suits free-form content. */
export function InfoCard({
  padding = "rows",
  className,
  children,
}: {
  padding?: "rows" | "block"
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-white/5 bg-surface",
        padding === "rows" ? "px-3 py-1" : "px-3 py-2",
        className,
      )}
    >
      {children}
    </div>
  )
}

/** An InfoCard with the standard mini heading. */
export function TitledCard({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <InfoCard padding="block">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</p>
        {action}
      </div>
      {children}
    </InfoCard>
  )
}

/** A label and its value. Below sm the label stacks above; from sm up it
 *  returns to a fixed-width column beside the value.
 *
 *  `min-w-0` on the value, because without it the row cannot be narrower than
 *  its widest unbreakable value, and `flex-1` will not shrink past that. In a
 *  256px sidebar that is enough to push a long publisher name out through the
 *  side of the panel. */
export function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-white/5 py-1.5 last:border-0 sm:flex-row sm:gap-2">
      <span className="shrink-0 pt-0.5 text-xs text-muted sm:w-24">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1 text-xs text-white/90">{children}</div>
    </div>
  )
}

/** Values joined by a separator dimmer than the values themselves, which is
 *  how a multi-value field reads without giving each one a box. */
export function InlineList({
  items,
  separator = ", ",
}: {
  items: React.ReactNode[]
  separator?: string
}) {
  return (
    <span>
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 && <span className="text-white/30">{separator}</span>}
          {item}
        </span>
      ))}
    </span>
  )
}
