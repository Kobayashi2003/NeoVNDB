/** A service's settings that take effect while it runs: each field as a value
 *  to edit, with .env's beside it once they differ. */
'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type { ImageSettings, ServeSettings, Settings } from '@/lib/admin';
import { errorText } from '@/lib/user';
import { ChoiceMenu } from '@/components/ui/ChoiceMenu';
import { PlaceholderLines } from '@/components/ui/Surface';
import { Button, Card, FIELD, Trouble } from './parts';

type Kind =
  /** A Go duration; 0 turns a schedule off. */
  | 'duration'
  | 'count'
  /** A fraction, edited as a percentage. */
  | 'percent'
  /** One of several; `flag` sends "true" and "false" as a boolean. */
  | { choices: [string, string][]; flag?: boolean };

export interface Field<T> {
  key: keyof T & string;
  label: string;
  hint: string;
  kind: Kind;
}

export const SERVE_FIELDS: Field<ServeSettings>[] = [
  {
    key: 'all_ages',
    label: 'All ages',
    hint: 'What is for adults (18+ releases, sexual tags and traits, suggestive or violent images) is never shown to anyone not signed in. This decides whether it is hidden from everyone.',
    kind: {
      flag: true,
      choices: [
        ['false', 'Only for guests'],
        ['true', 'For everyone'],
      ],
    },
  },
  {
    key: 'update_every',
    label: 'Check for a new dump every',
    hint: 'A Go duration such as 24h; 0 turns the scheduled update off.',
    kind: 'duration',
  },
  {
    key: 'update_retry_after',
    label: 'Retry an unreachable upstream after',
    hint: '0 waits the full interval.',
    kind: 'duration',
  },
  {
    key: 'dump_keep',
    label: 'Archives kept',
    hint: 'After each update; 0 keeps every one.',
    kind: 'count',
  },
  {
    key: 'guard_max_loss',
    label: 'Largest table shrink allowed (%)',
    hint: 'A bigger loss refuses to go live; 0 turns the check off.',
    kind: 'percent',
  },
];

export const IMAGE_FIELDS: Field<ImageSettings>[] = [
  {
    key: 'miss',
    label: 'An image not on disk yet',
    hint: 'Sending the reader to vndb is quicker where vndb is close to them, and shows vndb who they are.',
    kind: {
      choices: [
        ['redirect', 'Send to vndb, fetch behind'],
        ['fetch', 'Fetch while the reader waits'],
      ],
    },
  },
  {
    key: 'crawl_every',
    label: 'Crawl every',
    hint: 'A Go duration such as 1h; 0 turns the crawl off.',
    kind: 'duration',
  },
  {
    key: 'crawl_per_run',
    label: 'Images per crawl',
    hint: '0 fetches everything missing.',
    kind: 'count',
  },
  {
    key: 'crawl_delay',
    label: 'Between two crawled images',
    hint: 'Out of politeness to vndb.',
    kind: 'duration',
  },
];

/** "1h0m0s" as typed: "1h". */
export function compact(go: string): string {
  return go.replace(/(\D)0s$/, '$1').replace(/(\D)0m$/, '$1');
}

/** A value as its input shows it. */
export function shown(kind: Kind, value: unknown): string {
  if (kind === 'duration') return compact(String(value));
  // Rounded, or 0.07 shows as 7.000000000000001.
  if (kind === 'percent') return String(Math.round(Number(value) * 1e6) / 1e4);
  return String(value);
}

/** What an input holds, as the service takes it; null when it is not a number. */
export function parsed(kind: Kind, text: string): unknown {
  if (kind === 'count' || kind === 'percent') {
    const n = Number(text.trim());
    if (text.trim() === '' || !Number.isFinite(n)) return null;
    return kind === 'percent' ? n / 100 : n;
  }
  if (typeof kind === 'object' && kind.flag) return text === 'true';
  return text.trim();
}

function draftOf<T>(fields: Field<T>[], s: Settings<T>): Record<string, string> {
  const values = s.values as Record<string, unknown>;
  return Object.fromEntries(fields.map(f => [f.key, shown(f.kind, values[f.key])]));
}

export function SettingsWaiting({ title }: { title: string }) {
  return (
    <Card title={title}>
      <PlaceholderLines lines={4} />
    </Card>
  );
}

export function SettingsCard<T extends object>({
  title,
  fields,
  read,
  change,
  onSaved,
}: {
  title: string;
  fields: Field<T>[];
  read: () => Promise<Settings<T>>;
  change: (patch: Partial<T>) => Promise<Settings<T>>;
  /** After a change, for whatever shows these values elsewhere. */
  onSaved: () => void;
}) {
  const [settings, setSettings] = useState<Settings<T> | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [trouble, setTrouble] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const take = (s: Settings<T>) => {
    setSettings(s);
    setDraft(draftOf(fields, s));
  };

  useEffect(() => {
    let live = true;
    read().then(
      s => {
        if (!live) return;
        setSettings(s);
        setDraft(draftOf(fields, s));
      },
      err => live && setTrouble(errorText(err)),
    );
    return () => {
      live = false;
    };
  }, [read, fields]);

  if (!settings) {
    return trouble ? (
      <Card title={title}>
        <Trouble text={trouble} />
      </Card>
    ) : (
      <SettingsWaiting title={title} />
    );
  }

  const values = settings.values as Record<string, unknown>;
  const env = settings.env as Record<string, unknown>;
  const edited = fields.filter(f => draft[f.key] !== shown(f.kind, values[f.key]));

  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    setTrouble(null);
    try {
      take(await change(patch as Partial<T>));
      onSaved();
    } catch (err) {
      setTrouble(errorText(err));
    }
    setBusy(false);
  }

  function saveEdits() {
    const patch: Record<string, unknown> = {};
    for (const f of edited) {
      const value = parsed(f.kind, draft[f.key]);
      if (value === null) {
        setTrouble(`${f.label}: not a number.`);
        return;
      }
      patch[f.key] = value;
    }
    void save(patch);
  }

  return (
    <Card
      title={title}
      aside={
        edited.length > 0 && (
          <span className="flex gap-2">
            <Button disabled={busy} onClick={() => take(settings)}>
              Undo
            </Button>
            <Button disabled={busy} onClick={saveEdits}>
              Save
            </Button>
          </span>
        )
      }
    >
      <div className="flex flex-col gap-3">
        {fields.map(f => {
          const id = `setting-${f.key}`;
          const fromEnv = shown(f.kind, env[f.key]);
          const changed = settings.changed.includes(f.key);
          return (
            <div key={f.key} className="flex flex-col gap-1 text-xs">
              {typeof f.kind === 'object' ? (
                <>
                  {/* The menu names itself to a screen reader; this is for the eye. */}
                  <span className="font-medium" aria-hidden>
                    {f.label}
                  </span>
                  <ChoiceMenu
                    label={f.label}
                    value={draft[f.key]}
                    choices={f.kind.choices.map(([value, label]) => ({ value, label }))}
                    onChange={value => setDraft({ ...draft, [f.key]: value })}
                  />
                </>
              ) : (
                <>
                  <label htmlFor={id} className="font-medium">
                    {f.label}
                  </label>
                  <input
                    id={id}
                    value={draft[f.key]}
                    disabled={busy}
                    inputMode={f.kind === 'duration' ? 'text' : 'decimal'}
                    spellCheck={false}
                    onChange={e => setDraft({ ...draft, [f.key]: e.target.value })}
                    className={cn(FIELD, 'font-mono tabular-nums')}
                  />
                </>
              )}
              <p className="text-muted">
                {f.hint}
                {changed && (
                  <>
                    {' '}
                    <span className="text-amber-300">Set here; .env says {fromEnv}.</span>{' '}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => save({ [f.key]: env[f.key] })}
                      className="underline underline-offset-2 hover:text-white disabled:opacity-50"
                    >
                      Use .env&apos;s
                    </button>
                  </>
                )}
              </p>
            </div>
          );
        })}
        <Trouble text={trouble} />
      </div>
    </Card>
  );
}
