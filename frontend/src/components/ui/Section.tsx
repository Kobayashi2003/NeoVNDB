import { ChevronRight } from "lucide-react"

/** A main-column heading. The short accent tick anchors it and lifts it off
 *  the body without the weight of a full divider. */
export function Section({
  title,
  count,
  action,
  onTitleClick,
  children,
}: {
  title: string
  count?: number
  action?: React.ReactNode
  /** When set the heading becomes a button, with a chevron to say so. */
  onTitleClick?: () => void
  children: React.ReactNode
}) {
  const heading = (
    <>
      <span className="text-sm font-bold uppercase tracking-wider transition-colors group-hover:text-accent">
        {title}
      </span>
      {count !== undefined && <span className="text-xs font-normal text-muted">{count}</span>}
      {onTitleClick && (
        <ChevronRight
          className="icon-caps h-4 w-4 text-muted transition-colors group-hover:text-accent"
          aria-hidden
        />
      )}
    </>
  )

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2.5">
        <span className="h-4 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
        {onTitleClick ? (
          <button
            type="button"
            onClick={onTitleClick}
            className="group flex cursor-pointer items-center gap-2.5"
          >
            {heading}
          </button>
        ) : (
          heading
        )}
        {action && <span className="ml-auto">{action}</span>}
      </h2>
      {children}
    </section>
  )
}
