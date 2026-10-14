/** A release's title per language, shown when there is more than one.
 *  Languages with no recorded title collapse into one line of flags; machine
 *  translations are marked, not hidden. */

import { iconOf } from '@/lib/icons';
import { enumLabel } from '@/lib/enums';
import { Icon } from '@/components/ui/Icon';
import type { ReleaseTitle } from '@/lib/types';

export function ReleaseTitles({ titles, olang }: { titles: ReleaseTitle[]; olang: string }) {
  // The release's own language leads; the rest follow as they arrive, which is
  // alphabetical by code.
  const order = [...titles].sort((a, b) => (a.lang === olang ? -1 : b.lang === olang ? 1 : 0));
  const named = order.filter(t => t.title || t.latin);
  const bare = order.filter(t => !t.title && !t.latin);

  return (
    <dl className="rounded-lg border border-white/5 bg-surface">
      {named.map(t => (
        <div
          key={t.lang}
          className="flex flex-col gap-0.5 border-b border-white/5 px-3 py-2 last:border-0 sm:flex-row sm:items-baseline sm:gap-3"
        >
          <dt className="flex shrink-0 items-center gap-1.5 sm:w-36">
            <Icon
              cls={iconOf('LANGUAGE', t.lang)}
              title={enumLabel('LANGUAGE', t.lang)}
              className={t.lang === olang ? 'rounded-xs ring-1 ring-accent' : undefined}
            />
            <span className="text-xs text-muted">{enumLabel('LANGUAGE', t.lang)}</span>
          </dt>
          <dd className="min-w-0 flex-1 text-sm">
            {t.title ?? t.latin}
            {t.latin && t.title && t.latin !== t.title && (
              <span className="ml-2 text-xs text-muted">{t.latin}</span>
            )}
            {t.mtl && <span className="ml-2 text-xs text-yellow-500/80">machine translation</span>}
          </dd>
        </div>
      ))}

      {bare.length > 0 && (
        <div className="flex flex-col gap-1 border-b border-white/5 px-3 py-2 last:border-0 sm:flex-row sm:items-baseline sm:gap-3">
          <dt className="shrink-0 text-xs text-muted sm:w-36">Also published in</dt>
          <dd className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {bare.map(t => (
              <Icon
                key={t.lang}
                cls={iconOf('LANGUAGE', t.lang)}
                title={enumLabel('LANGUAGE', t.lang)}
              />
            ))}
          </dd>
        </div>
      )}
    </dl>
  );
}
