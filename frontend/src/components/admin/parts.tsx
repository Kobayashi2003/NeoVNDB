/** Pieces the admin tabs share. */
'use client';

import { cn } from '@/lib/utils';
import type { Job } from '@/lib/admin';
import { surface } from '@/components/ui/Surface';

export const FIELD =
  'rounded-lg border border-white/10 bg-background/40 px-3 py-2 text-sm outline-none transition-colors focus:border-white/30';

export function Card({
  title,
  aside,
  children,
  className,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={surface(cn('flex min-w-0 flex-col gap-3 p-4', className))}>
      {/* As tall as the button beside the title, which comes with the data. */}
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Button({
  onClick,
  disabled,
  danger,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-7 items-center rounded-full px-3 text-xs font-semibold transition-colors disabled:opacity-50',
        danger ? 'bg-red-500/15 text-red-300 hover:bg-red-500/25' : 'bg-white/10 hover:bg-white/20',
      )}
    >
      {children}
    </button>
  );
}

/** Label and value pairs. */
export function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          {/* anywhere, not break-word: only anywhere lets a long path shrink the
              column, rather than breaking only once it has already overflowed. */}
          <dd className="min-w-0 tabular-nums [overflow-wrap:anywhere]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** How a scheduled job last went, and when it runs next. */
export function JobFacts({ job, extra = [] }: { job: Job; extra?: [string, React.ReactNode][] }) {
  return (
    <Facts
      rows={[
        [
          'Last run',
          job.running ? (
            <span className="text-accent">running since {when(job.started_at)}</span>
          ) : job.finished_at ? (
            <>
              {when(job.finished_at)}{' '}
              {job.error ? (
                <span className="text-red-400">failed: {job.error}</span>
              ) : (
                <span className="text-muted">ok</span>
              )}
            </>
          ) : (
            <span className="text-muted">not since the service started</span>
          ),
        ],
        [
          'Next',
          job.next_at ? when(job.next_at) : <span className="text-muted">not scheduled</span>,
        ],
        ...extra,
      ]}
    />
  );
}

/** The tail of a job's output, newest at the bottom. */
export function Output({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <pre className="max-h-64 overflow-auto rounded-lg bg-background/60 p-3 font-mono text-[0.6875rem] leading-relaxed text-white/80">
      {lines.join('\n')}
    </pre>
  );
}

export function Trouble({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="text-xs text-red-400">
      {text}
    </p>
  );
}

/** A moment in the reader's own clock, to the minute. */
export function when(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A Go duration ("24h0m0s") as a person writes it ("1 day"). */
export function span(go: string): string {
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?$/.exec(go);
  if (!m || go === '') return go;
  const [h, min, s] = [Number(m[1] ?? 0), Number(m[2] ?? 0), Number(m[3] ?? 0)];
  if (h > 0 && h % 24 === 0 && min === 0 && s === 0) return h === 24 ? '1 day' : `${h / 24} days`;
  const parts = [h && `${h}h`, min && `${min}m`, s && `${s}s`].filter(Boolean);
  return parts.length ? parts.join(' ') : '0s';
}

export function bytes(n: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
