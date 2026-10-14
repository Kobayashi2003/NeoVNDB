/** The relation graph for one visual novel, at its own address under the
 *  novel's: /v17/rg, the way vndb writes it.
 *
 *  The depth is in the address like every other piece of state here, so a
 *  graph opened out to five steps is a link somebody can be sent. How deep it
 *  may go is the API's to say; a depth past that is its error to report. */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ApiError, byId, relationGraph } from '@/lib/api';
import { one, withParams } from '@/lib/href';
import { cn } from '@/lib/utils';
import { Name } from '@/components/ui/Name';
import { RelationGraph } from '@/components/graph/RelationGraph';
import type { RelationGraph as Graph } from '@/lib/graph';

const DEFAULT_DEPTH = 2;

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

/** One step per depth the API allows. A step that cannot change the graph --
 *  past where it ends, or past the node ceiling it already hit -- is shown but
 *  not offered. */
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
  // 0 is "no ceiling"; offer a few steps past wherever the reader is.
  const most = graph.max_depth || Math.max(5, depth + 1);
  const last = graph.capped ? depth : graph.truncated ? most : graph.reach;
  const count = `${graph.nodes.length} ${graph.nodes.length === 1 ? 'title' : 'titles'}`;
  const more = graph.truncated && !graph.capped && depth < most;

  return (
    <>
      <nav
        aria-label="Steps out"
        className="flex w-fit items-center gap-0.5 rounded-full border border-white/10 p-0.5"
      >
        {Array.from({ length: most }, (_, i) => i + 1).map(d => {
          const label = `${d} ${d === 1 ? 'step' : 'steps'} out`;
          const style = 'w-6 rounded-full py-0.5 text-center text-xs font-medium tabular-nums';
          if (d !== depth && d > Math.max(last, 1)) {
            return (
              <span
                key={d}
                aria-disabled
                aria-label={label}
                title="Nothing more is shown this far out"
                className={cn(style, 'cursor-default text-muted/30')}
              >
                {d}
              </span>
            );
          }
          return (
            <Link
              key={d}
              href={withParams(`/${slug}/rg`, query, {
                depth: d === DEFAULT_DEPTH ? null : String(d),
              })}
              aria-current={d === depth ? 'page' : undefined}
              aria-label={label}
              className={cn(
                style,
                'transition-colors',
                d === depth
                  ? 'bg-white/20 text-white'
                  : 'text-muted hover:bg-white/10 hover:text-white',
              )}
            >
              {d}
            </Link>
          );
        })}
      </nav>
      <p className="text-[0.6875rem] leading-snug text-muted">
        {graph.capped
          ? `${count}, the most one graph shows; it stops here.`
          : !graph.truncated
            ? `${count}; nothing further out.`
            : more
              ? `${count}, and more further out.`
              : `${count}, and more further out than a graph goes.`}
        {more && (
          <>
            {' '}
            <Link
              href={withParams(`/${slug}/rg`, query, { depth: String(depth + 1) })}
              className="text-accent transition-colors hover:text-accent-hover"
            >
              One step more
            </Link>
          </>
        )}
      </p>
    </>
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
