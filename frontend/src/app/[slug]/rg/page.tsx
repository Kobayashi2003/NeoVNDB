/** The relation graph for one visual novel, at its own address under the
 *  novel's: /v17/rg, the way vndb writes it.
 *
 *  The depth is in the address like every other piece of state here, so a
 *  graph opened out to five steps is a link somebody can be sent. How deep it
 *  may go is the API's to say; a depth past that is its error to report. */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronsRight, Minus, Plus, TriangleAlert } from 'lucide-react';
import { ApiError, byId, relationGraph } from '@/lib/api';
import { one, withParams } from '@/lib/href';
import { cn } from '@/lib/utils';
import { Name } from '@/components/ui/Name';
import { Notice, noticeAction } from '@/components/ui/Notice';
import { RelationGraph } from '@/components/graph/RelationGraph';
import { steps, type RelationGraph as Graph } from '@/lib/graph';

const DEFAULT_DEPTH = 2;
/** As many step numbers as fit across the heading card. */
const MAX_PILLS = 8;

export default async function RelationGraphPage({ params, searchParams }: PageProps<'/[slug]/rg'>) {
  const { slug } = await params;
  const query = await searchParams;
  if (!/^v\d+$/.test(slug)) notFound();

  const asked = Number(one(query, 'depth'));
  const depth = Number.isInteger(asked) && asked >= 1 ? asked : DEFAULT_DEPTH;

  const vn = await byId<{ title: string | null; alttitle: string | null }>(
    'vn',
    slug,
    'title,alttitle',
  );
  if (!vn) notFound();

  let graph: Graph;
  try {
    graph = await relationGraph<Graph>(slug, depth);
  } catch (e) {
    // A graph the API refused to draw is not a missing page; say which it is.
    const why = e instanceof ApiError && e.status === 400 ? e.message : 'Something went wrong.';
    return (
      <main className="mx-auto w-full max-w-page px-4">
        <Notice
          icon={TriangleAlert}
          title="The graph could not be drawn"
          tone="trouble"
          page
          className="min-h-[70dvh]"
          actions={
            <Link href={`/${slug}`} className={noticeAction(true)}>
              Back to the novel
            </Link>
          }
        >
          {why}
        </Notice>
      </main>
    );
  }

  // The canvas takes all of the window under the site header and the heading
  // floats on it, in the same card as the controls: a strip above it would be
  // a second header, out of line with the first.
  return (
    <main className="h-[calc(100dvh-var(--header-h))]">
      <RelationGraph
        graph={graph}
        heading={
          <div className="flex flex-col gap-2 p-3">
            <Back id={slug} />
            <div>
              <p className="text-[0.625rem] font-semibold uppercase tracking-wider text-accent">
                Relation graph
              </p>
              {/* Through Name, so the heading answers the script toggle the
                  same way the cards in the graph do. */}
              <h1 className="mt-0.5 line-clamp-2 text-base font-bold leading-snug">
                <Name name={vn.title} original={vn.alttitle} fallback={slug} />
              </h1>
            </div>
            <Steps slug={slug} query={query} graph={graph} />
          </div>
        }
      />
    </main>
  );
}

/** The steps worth taking, and no others: none past where the graph ends or
 *  past the node ceiling it already hit. Within the card's width they are a
 *  row of numbers; beyond it, a stepper. */
function Steps({
  slug,
  query,
  graph,
}: {
  slug: string;
  query: Record<string, string | string[] | undefined>;
  graph: Graph;
}) {
  const { deepest, shown, deeper } = steps(graph);
  const count = `${graph.nodes.length} ${graph.nodes.length === 1 ? 'title' : 'titles'}`;
  const href = (d: number) =>
    withParams(`/${slug}/rg`, query, { depth: d === DEFAULT_DEPTH ? null : String(d) });
  const label = (d: number) => `${d} ${d === 1 ? 'step' : 'steps'} out`;

  // As tall as Deepest beside it, the steps filling it inside the border.
  const bar = 'flex h-7 w-fit items-stretch gap-0.5 rounded-full border border-white/10 p-0.5';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {deepest <= MAX_PILLS ? (
          <nav aria-label="Steps out" className={bar}>
            {Array.from({ length: deepest }, (_, i) => i + 1).map(d => (
              <Link
                key={d}
                href={href(d)}
                aria-current={d === shown ? 'page' : undefined}
                aria-label={label(d)}
                className={cn(
                  'flex w-6 items-center justify-center rounded-full text-xs font-medium tabular-nums transition-colors',
                  d === shown
                    ? 'bg-white/20 text-white'
                    : 'text-muted hover:bg-white/10 hover:text-white',
                )}
              >
                {d}
              </Link>
            ))}
          </nav>
        ) : (
          // Too many steps for a row of numbers: one step either way instead.
          <nav aria-label="Steps out" className={bar}>
            <StepLink href={shown > 1 ? href(shown - 1) : null} label="One step fewer">
              <Minus />
            </StepLink>
            <span
              aria-current="page"
              className="flex items-center px-2 text-xs font-medium tabular-nums text-white"
            >
              {label(shown)}
            </span>
            <StepLink href={deeper ? href(shown + 1) : null} label="One step more">
              <Plus />
            </StepLink>
          </nav>
        )}
        {/* Straight to the end rather than a step at a time; still there at the
          end, disabled, so the row does not shift under the pointer. */}
        <StepLink href={deeper ? href(deepest) : null} label={`Deepest, ${label(deepest)}`} wide>
          <ChevronsRight />
          Deepest
        </StepLink>
      </div>
      <p className="text-[0.6875rem] leading-snug text-muted">
        {graph.capped
          ? `${count}, the most one graph shows; it stops here.`
          : !graph.truncated
            ? `${count}; nothing further out.`
            : deeper
              ? `${count}, and more further out.`
              : `${count}, and more further out than a graph goes.`}
      </p>
    </div>
  );
}

function StepLink({
  href,
  label,
  wide = false,
  children,
}: {
  href: string | null;
  label: string;
  /** Text beside the icon, in a pill of its own. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  const style = cn(
    'flex items-center justify-center rounded-full [&>svg]:h-3.5 [&>svg]:w-3.5',
    wide ? 'h-7 gap-1 border border-white/10 pl-1.5 pr-2.5 text-xs font-medium' : 'w-6',
  );
  if (!href) {
    return (
      <span aria-disabled aria-label={label} className={cn(style, 'text-muted/30')}>
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cn(style, 'text-muted transition-colors hover:bg-white/10 hover:text-white')}
    >
      {children}
    </Link>
  );
}

function Back({ id }: { id: string }) {
  return (
    <Link
      href={`/${id}`}
      className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-white coarse:py-1"
    >
      <ArrowLeft className="icon-text h-3 w-3" aria-hidden />
      Back to the novel
    </Link>
  );
}

export async function generateMetadata({ params }: PageProps<'/[slug]/rg'>) {
  const { slug } = await params;
  if (!/^v\d+$/.test(slug)) return { title: 'NeoVNDB' };
  // The page's fields, so this and the page are one request.
  const vn = await byId<{ title: string | null }>('vn', slug, 'title,alttitle');
  return { title: vn?.title ? `Relations: ${vn.title} - NeoVNDB` : 'NeoVNDB' };
}
