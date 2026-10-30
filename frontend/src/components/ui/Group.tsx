/** A large part of a long page, under its own heading, that a SectionNav given
 *  `of={GROUP}` jumps between: the statistics page's kinds, the admin page's
 *  services. Sections inside it are its smaller headings. */

/** What a SectionNav lists to jump between groups rather than every section. */
export const GROUP = 'section[data-group]';

export function Group({
  title,
  action,
  children,
}: {
  title: string;
  /** Controls for the whole group, right of the heading. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={title.toLowerCase().replace(/[^a-z]+/g, '-')}
      data-group
      data-section={title}
      // Clear of the header and the jump row stuck under it.
      className="flex scroll-mt-[calc(var(--header-h)+4rem)] flex-col gap-8"
    >
      <div className="-mb-2 flex min-h-7 flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        <h2 className="text-xl font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
