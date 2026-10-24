/** One result card: tiles with a picture for VNs and characters, rows for
 *  the name-first types. */
'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { thumbnailURL } from '@/lib/images';
import { iconOf } from '@/lib/icons';
import { enumLabel } from '@/lib/enums';
import { plain } from '@/lib/bbcode';
import { shouldBlur } from '@/lib/content';
import { display, releaseDate, score } from '@/lib/format';
import { AgeRating } from '@/components/ui/AgeRating';
import { Icon } from '@/components/ui/Icon';
import { Name } from '@/components/ui/Name';
import { ImageWithFallback } from '@/components/ui/ImageWithFallback';
import { usePrefs } from '@/hooks/usePrefs';
import type {
  CharacterRow,
  Image,
  ProducerRow,
  ReleaseRow,
  StaffRow,
  TagRow,
  TraitRow,
  VNRow,
} from '@/lib/types';

/* ─── Shared pieces ───────────────────────────────────────────────────────── */

/** The tile frame and its picture, which the two image types share. */
function Tile({
  href,
  image,
  alt,
  ratio,
  children,
}: {
  href: string;
  image: Image | null;
  alt: string;
  /** Covers are portrait and portraits are nearly square; each keeps its own. */
  ratio: string;
  children: React.ReactNode;
}) {
  const { sexual, violence } = usePrefs();
  const blur = !!image && shouldBlur(image.sexual, image.violence, sexual, violence);

  return (
    <Link href={href} className="group block h-full">
      <div className="flex h-full flex-col overflow-hidden rounded-lg border border-white/5 bg-surface transition-transform duration-200 hover:scale-[1.02] hover:border-white/20">
        <div className={cn('relative w-full shrink-0 overflow-hidden bg-elevated', ratio)}>
          {image ? (
            <ImageWithFallback
              src={thumbnailURL(image)}
              alt={alt}
              width={image.dims[0]}
              height={image.dims[1]}
              wrapperClassName="h-full w-full"
              className={cn(
                'h-full w-full object-cover object-top transition-[filter] duration-300',
                blur && 'scale-105 blur-xl',
              )}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted">
              No image
            </div>
          )}
        </div>
        <div className="flex min-h-14 flex-1 flex-col gap-0.5 overflow-hidden p-2">{children}</div>
      </div>
    </Link>
  );
}

/** The two tile shapes: covers are portrait, portraits nearly square. */
export const COVER = 'aspect-[2/3]';
export const PORTRAIT = 'aspect-[17/20]';

/** The row frame the five text types share. */
function Row({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-baseline gap-3 border-b border-white/5 px-3 py-2 transition-colors last:border-0 hover:bg-white/[0.04]"
    >
      {children}
    </Link>
  );
}

/** A saved entry vndb no longer has. Not a link: there is no page to go to. */
export function GoneCard({ id, ratio }: { id: string; ratio?: string }) {
  const note = 'No longer on vndb';
  if (!ratio) {
    return (
      <div className="flex items-baseline gap-3 border-b border-white/5 px-3 py-2 text-muted last:border-0">
        <span className="font-mono text-xs">{id}</span>
        <span className="min-w-0 flex-1 truncate text-sm italic">{note}</span>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-dashed border-white/10 bg-surface/50">
      <div
        className={cn(
          'flex w-full shrink-0 items-center justify-center bg-elevated/50 p-2 text-center text-xs text-muted',
          ratio,
        )}
      >
        {note}
      </div>
      <div className="flex min-h-14 flex-1 flex-col gap-0.5 p-2 text-xs text-muted">
        <p className="font-mono">{id}</p>
        <p>Hidden or deleted there; remove it when you like.</p>
      </div>
    </div>
  );
}

/* ─── Per type ────────────────────────────────────────────────────────────── */

export function VNCard({ row }: { row: VNRow }) {
  const { original } = usePrefs();
  return (
    <Tile href={`/${row.id}`} image={row.image} alt={row.title ?? ''} ratio={COVER}>
      <p className="truncate text-xs font-semibold">{display(row.title, row.alttitle, original)}</p>
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <span className="tabular-nums">{releaseDate(row.released)}</span>
        {row.rating !== null && (
          <span className="text-accent tabular-nums">{score(row.rating)}</span>
        )}
      </p>
      <p className="flex flex-wrap items-center gap-1">
        {row.languages.slice(0, 6).map(l => (
          <Icon key={l} cls={iconOf('LANGUAGE', l)} title={enumLabel('LANGUAGE', l)} />
        ))}
        {row.platforms.slice(0, 4).map(p => (
          <Icon key={p} cls={iconOf('PLATFORM', p)} title={enumLabel('PLATFORM', p)} />
        ))}
      </p>
    </Tile>
  );
}

export function CharacterCard({ row }: { row: CharacterRow }) {
  const { original } = usePrefs();
  return (
    <Tile href={`/${row.id}`} image={row.image} alt={row.name} ratio={PORTRAIT}>
      <p className="truncate text-xs font-semibold">{display(row.name, row.original, original)}</p>
      {row.sex && (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Icon
            cls={iconOf('CHARACTER_SEX', row.sex)}
            title={enumLabel('CHARACTER_SEX', row.sex)}
          />
          {enumLabel('CHARACTER_SEX', row.sex)}
        </p>
      )}
    </Tile>
  );
}

/** Platforms come after the title, so every title starts at the same place
 *  however many platforms the row before it had. On a phone the date and age
 *  columns would leave the title a few letters, so they go under it. */
export function ReleaseCard({ row }: { row: ReleaseRow }) {
  const date = <span className="tabular-nums">{releaseDate(row.released)}</span>;
  const platforms = row.platforms
    .slice(0, 5)
    .map(p => <Icon key={p} cls={iconOf('PLATFORM', p)} title={enumLabel('PLATFORM', p)} />);

  return (
    <Row href={`/${row.id}`}>
      <span className="hidden w-24 shrink-0 text-xs text-muted sm:block">{date}</span>
      <span className="hidden w-14 shrink-0 text-xs sm:block">
        <AgeRating minage={row.minage} />
      </span>
      <span className={cn('min-w-0 flex-1', !row.official && 'opacity-60')}>
        <span className="block truncate text-sm">
          <Name name={row.title} original={row.alttitle} />
          {row.patch && <span className="ml-1 text-xs text-muted">(patch)</span>}
          {!row.official && <span className="ml-1 text-xs text-muted">(unofficial)</span>}
          {row.freeware && <span className="ml-1 text-xs text-muted">(freeware)</span>}
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-xs text-muted sm:hidden">
          {date}
          <AgeRating minage={row.minage} />
          <span className="inline-flex items-center gap-1">{platforms}</span>
        </span>
      </span>
      <span className="hidden shrink-0 items-center gap-1 self-center sm:inline-flex">
        {platforms}
      </span>
    </Row>
  );
}

export function ProducerCard({ row }: { row: ProducerRow }) {
  const { original } = usePrefs();
  return (
    <Row href={`/${row.id}`}>
      <span className="shrink-0">
        <Icon cls={iconOf('LANGUAGE', row.lang)} title={enumLabel('LANGUAGE', row.lang)} />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">
        {display(row.name, row.original, original)}
      </span>
      <span className="shrink-0 text-xs text-muted">{enumLabel('TYPE', row.type)}</span>
    </Row>
  );
}

export function StaffCard({ row }: { row: StaffRow }) {
  const { original } = usePrefs();
  return (
    <Row href={`/${row.id}`}>
      <span className="shrink-0">
        <Icon cls={iconOf('LANGUAGE', row.lang)} title={enumLabel('LANGUAGE', row.lang)} />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">
        {display(row.name, row.original, original)}
      </span>
      {row.gender && (
        <span className="shrink-0 text-xs text-muted">{enumLabel('GENDER', row.gender)}</span>
      )}
    </Row>
  );
}

export function TagCard({ row }: { row: TagRow }) {
  const { original } = usePrefs();
  const description = (original && row.translation?.description) || row.description;

  return (
    <Row href={`/${row.id}`}>
      <span className="min-w-0 flex-1">
        <span className="text-sm">
          {display(row.name, row.translation?.name ?? null, original)}
        </span>
        {description && (
          <span className="ml-2 line-clamp-1 text-xs text-muted">{plain(description)}</span>
        )}
      </span>
      {/* The description needs the room more than the category on a phone. */}
      <span className="hidden shrink-0 text-xs text-muted sm:inline">
        {enumLabel('CATEGORY', row.category)}
      </span>
      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted">
        {row.vn_count.toLocaleString()}
      </span>
    </Row>
  );
}

export function TraitCard({ row }: { row: TraitRow }) {
  const { original } = usePrefs();
  const description = (original && row.translation?.description) || row.description;

  return (
    <Row href={`/${row.id}`}>
      <span className="min-w-0 flex-1">
        <span className="text-sm">
          {row.group_name && (
            <span className="text-muted">
              {display(row.group_name, row.group_translation, original)} /{' '}
            </span>
          )}
          {display(row.name, row.translation?.name ?? null, original)}
        </span>
        {description && (
          <span className="ml-2 line-clamp-1 text-xs text-muted">{plain(description)}</span>
        )}
      </span>
      {row.sexual && (
        <span className="hidden shrink-0 text-xs text-muted sm:inline">
          {enumLabel('CATEGORY', 'ero')}
        </span>
      )}
      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted">
        {row.char_count.toLocaleString()}
      </span>
    </Row>
  );
}
