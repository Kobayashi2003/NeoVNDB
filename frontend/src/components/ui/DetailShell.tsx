/** The frame a detail page hangs on.
 *
 *  From lg up it is two columns that scroll independently inside a
 *  viewport-height box, so the sidebar stays put while the body moves. Below
 *  that it collapses to one normally-scrolling column ordered header, sidebar,
 *  body -- the title should lead the page on a phone. */

import { cn } from "@/lib/utils"

export function DetailShell({
  header,
  aside,
  children,
}: {
  header: React.ReactNode
  aside: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-7xl gap-6 px-4",
        "lg:h-[calc(100vh-var(--header-h,0px))] lg:overflow-hidden",
      )}
    >
      {/* Both columns keep a little room on the right. Each scrolls on its own,
          so each grows its own scrollbar there, and content run right up
          against one reads as content that has been cut off. */}
      <aside className="hidden shrink-0 flex-col gap-3 overflow-y-auto overscroll-contain py-4 pr-3 lg:flex lg:w-64 xl:w-72 animate-slide-up-fade">
        {aside}
      </aside>

      <div className="min-w-0 flex-1 py-4 pb-12 lg:overflow-y-auto lg:overscroll-contain lg:pr-3 animate-slide-up-fade">
        <div className="mb-6">{header}</div>
        <div className="mb-6 flex flex-col gap-3 lg:hidden">{aside}</div>
        <div className="flex flex-col gap-8">{children}</div>
      </div>
    </div>
  )
}

/** Title block: h1, a free-form subtitle line, and a right-aligned control. */
export function DetailHeader({
  title,
  subtitle,
  action,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-bold leading-tight sm:text-2xl">{title}</h1>
        {subtitle}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
