/** Detail page frame: from lg up, two independently scrolling columns in a
 *  viewport-high box; below that one column, header then sidebar then body. */

import { cn } from '@/lib/utils';

export function DetailShell({
  header,
  aside,
  children,
}: {
  header: React.ReactNode;
  aside: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main
      className={cn(
        'mx-auto flex w-full max-w-page gap-6 px-4',
        'lg:h-[calc(100vh-var(--header-h,0px))] lg:overflow-hidden',
      )}
    >
      {/* Both columns keep a little room on the right. Each scrolls on its own,
          so each grows its own scrollbar there, and content run right up
          against one reads as content that has been cut off.

          And a little on the left, so that nothing moves: cancelled by an equal
          negative margin, and on the sidebar paid for with the same width
          again, since a fixed-width box shifted left takes its right edge and
          the column beside it along. A scroll box clips in both directions --
          overflow-y auto makes overflow-x auto too -- so a ring or focus
          outline on anything flush with the left edge lost its left side.

          Both keep their scrollbar's gutter whether or not they scroll.
          Whether they do depends on the page -- a VN's sidebar is long, a
          producer's is not -- and on what the reader opens, so without it
          the usable width changed between pages and whenever a section
          grew past the window. */}
      <aside className="-ml-1 hidden shrink-0 flex-col gap-3 overflow-y-auto overscroll-contain py-4 pl-1 pr-3 [scrollbar-gutter:stable] lg:flex lg:w-[16.25rem] xl:w-[18.25rem] animate-slide-up-fade">
        {aside}
      </aside>

      <div
        data-scroll-top
        className="min-w-0 flex-1 py-4 pb-12 lg:-ml-1 lg:overflow-y-auto lg:overscroll-contain lg:pl-1 lg:pr-3 lg:[scrollbar-gutter:stable] animate-slide-up-fade"
      >
        <div className="mb-6">{header}</div>
        <div className="mb-6 flex flex-col gap-3 lg:hidden">{aside}</div>
        <div className="flex flex-col gap-8">{children}</div>
      </div>
    </main>
  );
}

/** Title block: h1, a free-form subtitle line, and a right-aligned control. */
export function DetailHeader({
  title,
  subtitle,
  action,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-bold leading-tight sm:text-2xl">{title}</h1>
        {subtitle}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
