/** Shared popover menu pieces. Rows are a class helper (`menuItem`), not a
 *  component, since a row may be a link or a button. */

import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export function MenuPanel({
  align = "start",
  above = false,
  scroll = false,
  className,
  children,
  ref,
}: {
  /** Which edge of the control the panel hangs from. */
  align?: "start" | "end"
  /** Open upward, for a control that sits at the bottom of the screen. */
  above?: boolean
  /** Cap the height and scroll, for a menu that can be long. */
  scroll?: boolean
  /** Width overrides, for a panel whose contents are not rows. */
  className?: string
  children: React.ReactNode
  ref?: React.Ref<HTMLDivElement>
}) {
  return (
    <div
      ref={ref}
      className={cn(
        "absolute z-30 w-max min-w-40 max-w-[min(18rem,calc(100vw-2rem))]",
        "rounded-xl border border-white/10 bg-[var(--overlay)] p-1 shadow-xl shadow-black/50 animate-menu-in",
        align === "start" ? "left-0" : "right-0",
        above ? "bottom-full mb-2" : "top-full mt-1.5",
        scroll && "max-h-80 overflow-y-auto overscroll-contain",
        className,
      )}
    >
      {children}
    </div>
  )
}

/** The look of one row. `current` is for the row that is where the reader
 *  already is; a row that can be switched on says so with a MenuMark instead. */
export function menuItem({ current = false, className }: { current?: boolean; className?: string } = {}) {
  return cn(
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs outline-none transition-colors",
    current
      ? "bg-white/10 text-white"
      : "text-white/80 hover:bg-white/[0.07] hover:text-white focus-visible:bg-white/[0.07] focus-visible:text-white",
    className,
  )
}

/** Whether a row is on, and what kind of choice it is part of. A checkbox where
 *  several can be on at once, a radio where choosing one replaces the last --
 *  which is the thing a reader needs to know before clicking, and which a
 *  bare tick does not say. An unchosen row shows the empty control rather than
 *  a gap, so its text is visibly aligned rather than inexplicably indented. */
export function MenuMark({ kind, on }: { kind: "check" | "radio"; on: boolean }) {
  if (kind === "radio") {
    return (
      <span
        className={cn(
          "flex size-3.5 shrink-0 items-center justify-center rounded-full border transition-colors",
          on ? "border-accent" : "border-white/25",
        )}
        aria-hidden
      >
        {on && <span className="size-1.5 rounded-full bg-accent" />}
      </span>
    )
  }
  return (
    <span
      className={cn(
        "flex size-3.5 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
        on ? "border-accent bg-accent" : "border-white/25",
      )}
      aria-hidden
    >
      {on && <Check className="size-2.5 text-background" strokeWidth={4} />}
    </span>
  )
}

/** A heading inside a menu, with room for one small action beside it and an
 *  icon in front of it. */
export function MenuLabel({
  children,
  action,
  icon,
}: {
  children: React.ReactNode
  action?: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-2.5 pb-1 pt-1.5">
      <span className="flex items-center gap-1.5 text-[0.625rem] font-semibold uppercase tracking-wider text-muted/70">
        {icon}
        {children}
      </span>
      {action}
    </div>
  )
}

/** The look of that action: quieter than a row, and never uppercase. */
export const menuAction = "text-[0.6875rem] text-muted transition-colors hover:text-white"

export function MenuDivider() {
  return <div className="-mx-1 my-1 h-px bg-white/10" role="separator" />
}
