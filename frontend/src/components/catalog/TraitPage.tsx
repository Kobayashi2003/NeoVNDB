/** A trait and its characters: `trait` includes child traits, `dtrait` only
 *  direct ones. Shown under its group ("Hair / Blonde"), since names alone are
 *  often ambiguous. */

import Link from 'next/link';
import type { Params } from '@/lib/href';
import { countOf } from '@/lib/results';
import { Collapsible } from '@/components/ui/Collapsible';
import { InfoCard, InfoRow, TitledCard } from '@/components/ui/InfoCard';
import { DetailControls } from '@/components/user/DetailControls';
import { Description } from '@/components/ui/Description';
import { Name } from '@/components/ui/Name';
import { CatalogPage } from './CatalogPage';
import type { TraitDetail } from '@/lib/types';

export async function TraitPage({ trait: t, params }: { trait: TraitDetail; params: Params }) {
  const path = `/${t.id}`;
  const [inherited, direct] = await Promise.all([
    countOf('c', { trait: t.id }),
    countOf('c', { dtrait: t.id }),
  ]);

  return (
    <CatalogPage
      title={<Name name={t.name} original={t.translation?.name ?? null} />}
      subtitle={
        t.group_name &&
        t.group_id && (
          <p className="mt-1 text-sm text-muted">
            in{' '}
            <Link href={`/${t.group_id}`} className="hover:text-accent coarse:py-1">
              <Name name={t.group_name} original={t.group_translation} />
            </Link>
          </p>
        )
      }
      path={path}
      params={params}
      empty="No characters carry this trait."
      tabs={[
        {
          value: 'all',
          label: 'Including child traits',
          count: inherited,
          type: 'c',
          filters: { trait: t.id },
        },
        // The direct ones are among the rest, so an equal count is the same
        // list; left out then, with the other empty tabs.
        {
          value: 'direct',
          label: 'Assigned directly',
          count: direct === inherited ? 0 : direct,
          type: 'c',
          filters: { dtrait: t.id },
        },
      ]}
      action={<DetailControls id={t.id} />}
      aside={
        <>
          <InfoCard>
            <InfoRow label="Characters">
              <span className="tabular-nums">{t.char_count.toLocaleString()}</span>
            </InfoRow>
            {t.sexual && (
              <InfoRow label="Content">
                <span className="text-rose-400/80">Sexual</span>
              </InfoRow>
            )}
            {/* A trait that is neither is a heading in the graph rather than
                something anyone assigns, which is why its own count is zero. */}
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
            <TitledCard title="Parent traits">
              <div className="flex flex-col gap-0.5 text-xs">
                {t.parents.map(p => (
                  <Link
                    key={p.id}
                    href={`/${p.id}`}
                    className="truncate text-white/80 hover:text-accent coarse:py-1"
                  >
                    <Name name={p.name} original={p.translation?.name ?? null} />
                    {p.main && t.parents.length > 1 && (
                      <span className="ml-1.5 text-muted">(main)</span>
                    )}
                  </Link>
                ))}
              </div>
            </TitledCard>
          )}

          {t.children.length > 0 && (
            <TitledCard title="Child traits">
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
                      {c.char_count.toLocaleString()}
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
