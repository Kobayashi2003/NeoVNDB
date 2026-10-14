/** A tag and its visual novels: `tag` includes child tags (what browsing
 *  means), `dtag` only direct ones (what an editor checks). */

import Link from 'next/link';
import { enumLabel } from '@/lib/enums';
import type { Params } from '@/lib/href';
import { countOf } from '@/lib/results';
import { Collapsible } from '@/components/ui/Collapsible';
import { InfoCard, InfoRow, TitledCard } from '@/components/ui/InfoCard';
import { DetailControls } from '@/components/ui/DetailControls';
import { Description } from '@/components/ui/Description';
import { Name } from '@/components/ui/Name';
import { CatalogPage } from './CatalogPage';
import type { TagDetail } from '@/lib/types';

export async function TagPage({ tag: t, params }: { tag: TagDetail; params: Params }) {
  const path = `/${t.id}`;
  const [inherited, direct] = await Promise.all([
    countOf('v', { tag: t.id }),
    countOf('v', { dtag: t.id }),
  ]);

  return (
    <CatalogPage
      title={<Name name={t.name} original={t.translation?.name ?? null} />}
      path={path}
      params={params}
      empty="No visual novels carry this tag."
      tabs={[
        {
          value: 'all',
          label: 'Including child tags',
          count: inherited,
          type: 'v',
          filters: { tag: t.id },
        },
        // The direct ones are among the rest, so an equal count is the same
        // list; left out then, with the other empty tabs.
        {
          value: 'direct',
          label: 'Tagged directly',
          count: direct === inherited ? 0 : direct,
          type: 'v',
          filters: { dtag: t.id },
        },
      ]}
      action={<DetailControls id={t.id} />}
      aside={
        <>
          <InfoCard>
            <InfoRow label="Category">{enumLabel('CATEGORY', t.category)}</InfoRow>
            <InfoRow label="Visual novels">
              <span className="tabular-nums">{t.vn_count.toLocaleString()}</span>
            </InfoRow>
            {/* A tag that is neither is a heading in the graph rather than
                something anyone applies, which is why its own count is zero. */}
            {(!t.searchable || !t.applicable) && (
              <InfoRow label="Use">
                <span className="text-muted">
                  {!t.applicable && !t.searchable
                    ? 'Grouping only'
                    : !t.applicable
                      ? 'Not applicable to new entries'
                      : 'Not searchable'}
                </span>
              </InfoRow>
            )}
            {t.aliases.length > 0 && (
              <InfoRow label="Aliases">
                <span className="text-muted">{t.aliases.join(', ')}</span>
              </InfoRow>
            )}
          </InfoCard>

          {t.description && (
            <TitledCard title="About">
              <Collapsible>
                <Description text={t.description} translation={t.translation?.description} />
              </Collapsible>
            </TitledCard>
          )}

          {t.parents.length > 0 && (
            <TitledCard title="Parent tags">
              <div className="flex flex-col gap-0.5 text-xs">
                {t.parents.map(p => (
                  <Link
                    key={p.id}
                    href={`/${p.id}`}
                    className="truncate text-white/80 hover:text-accent coarse:py-1"
                  >
                    <Name name={p.name} original={p.translation?.name ?? null} />
                    {/* Several parents are possible; one of them is the one the
                        tag is filed under. */}
                    {p.main && t.parents.length > 1 && (
                      <span className="ml-1.5 text-muted">(main)</span>
                    )}
                  </Link>
                ))}
              </div>
            </TitledCard>
          )}

          {t.children.length > 0 && (
            <TitledCard title="Child tags">
              <div className="flex flex-col gap-0.5 text-xs">
                {t.children.map(c => (
                  <Link
                    key={c.id}
                    href={`/${c.id}`}
                    className="flex items-baseline justify-between gap-2 text-white/80 hover:text-accent coarse:py-1"
                  >
                    <span className="truncate">
                      <Name name={c.name} original={c.translation?.name ?? null} />
                    </span>
                    <span className="shrink-0 tabular-nums text-muted">
                      {c.vn_count.toLocaleString()}
                    </span>
                  </Link>
                ))}
              </div>
            </TitledCard>
          )}
        </>
      }
    />
  );
}
