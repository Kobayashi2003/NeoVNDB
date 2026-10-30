import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A main-column heading. The short accent tick anchors it and lifts it off
 *  the body without the weight of a full divider. */
export function Section({
  title,
  count,
  action,
  onTitleClick,
  children,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
  /** When set the heading becomes a button, with a chevron to say so. */
  onTitleClick?: () => void;
  children: React.ReactNode;
}) {
  const heading = (
    <>
      <span className="text-sm font-bold uppercase tracking-wider transition-colors group-hover:text-accent">
        {title}
      </span>
      {count !== undefined && (
        <span className="text-xs font-normal tabular-nums text-muted">
          {count.toLocaleString()}
        </span>
      )}
      {onTitleClick && (
        <ChevronRight
          className="icon-caps h-4 w-4 text-muted transition-colors group-hover:text-accent"
          aria-hidden
        />
      )}
    </>
  );

  // Named for the section nav, which finds sections by these and scrolls to
  // their ids. The scroll margin keeps a heading clear of that nav, which
  // sticks under the site header until the column scrolls on its own.
  return (
    <section
      id={sectionId(title)}
      data-section={title}
      data-count={count?.toLocaleString()}
      className="scroll-mt-[calc(var(--header-h)+4rem)] lg:scroll-mt-16"
    >
      {/* The controls beside the heading are not part of its name, so they
          sit next to the h2 rather than in it. */}
      <div className={cn('mb-3 flex items-center gap-2.5', action && 'min-h-7')}>
        <h2 className="flex min-w-0 items-center gap-2.5">
          <span className="h-4 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
          {onTitleClick ? (
            <button
              type="button"
              onClick={onTitleClick}
              className="group flex cursor-pointer items-center gap-2.5 coarse:py-1"
            >
              {heading}
            </button>
          ) : (
            heading
          )}
        </h2>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** "Voiced characters" is #voiced-characters: a section can be linked to. */
function sectionId(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
