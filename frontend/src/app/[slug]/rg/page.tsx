/** The relation graph for one visual novel, at its own address under the
 *  novel's: /v17/rg, the way vndb writes it.
 *
 *  The depth is in the address like every other piece of state here, so a
 *  graph opened out to five steps is a link somebody can be sent. How deep it
 *  may go is the API's to say; a depth past that is its error to report. */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Minus, Plus } from 'lucide-react';
import { ApiError, byId, relationGraph } from '@/lib/api';
import { one, withParams } from '@/lib/href';
import { cn } from '@/lib/utils';
import { Name } from '@/components/ui/Name';
import { RelationGraph } from '@/components/graph/RelationGraph';
import type { RelationGraph as Graph } from '@/lib/graph';

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
      <main className="mx-auto w-full max-w-page px-4 py-8 animate-slide-up-fade">
        <Back id={slug} />
        <p role="alert" className="mt-4 text-sm text-red-400">
          {why}
        </p>
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
  const { depth } = graph;
  const ceiling = graph.max_depth || Infinity;
  // The deepest step that draws anything new: where the graph ends, one past
  // the reader's while it goes on, and no further once the node ceiling hit.
  const useful = graph.capped
    ? depth
    : graph.truncated
      ? Math.min(ceiling, depth + 1)
      : Math.max(1, graph.reach);
  // A depth past where the graph ends draws the same graph as its end.
  const shown = Math.min(depth, useful);
  // While it goes on, a few steps are offered at once rather than one by one.
  const offered =
    graph.truncated && !graph.capped ? Math.min(ceiling, Math.max(5, useful)) : useful;
  const count = `${graph.nodes.length} ${graph.nodes.length === 1 ? 'title' : 'titles'}`;
  const href = (d: number) =>
    withParams(`/${slug}/rg`, query, { depth: d === DEFAULT_DEPTH ? null : String(d) });
  const label = (d: number) => `${d} ${d === 1 ? 'step' : 'steps'} out`;

  const bar = 'flex w-fit items-center gap-0.5 rounded-full border border-white/10 p-0.5';

  // One element rather than fragments: this is handed to the client panel as a
  // prop, and fragments from here once drew a missing-key warning there.
  return (
    <div className="flex flex-col gap-2">
      {offered <= MAX_PILLS ? (
        <nav aria-label="Steps out" className={bar}>
          {Array.from({ length: offered }, (_, i) => i + 1).map(d => (
            <Link
              key={d}
              href={href(d)}
              aria-current={d === shown ? 'page' : undefined}
              aria-label={label(d)}
              className={cn(
                'w-6 rounded-full py-0.5 text-center text-xs font-medium tabular-nums transition-colors',
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
          <span aria-current="page" className="px-2 text-xs font-medium tabular-nums text-white">
            {label(shown)}
          </span>
          <StepLink href={shown < useful ? href(shown + 1) : null} label="One step more">
            <Plus />
          </StepLink>
        </nav>
      )}
      <p className="text-[0.6875rem] leading-snug text-muted">
        {graph.capped
          ? `${count}, the most one graph shows; it stops here.`
          : !graph.truncated
            ? `${count}; nothing further out.`
            : depth < ceiling
              ? `${count}, and more further out.`
              : `${count}, and more further out than a graph goes.`}
      </p>
    </div>
  );
}

function StepLink({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: React.ReactNode;
}) {
  const style = 'flex h-6 w-6 items-center justify-center rounded-full [&>svg]:h-3.5 [&>svg]:w-3.5';
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
  const vn = await byId<{ title: string | null }>('vn', slug, 'title');
  return { title: vn?.title ? `Relations: ${vn.title} - NeoVNDB` : 'NeoVNDB' };
}
