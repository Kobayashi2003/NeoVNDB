/** The services' state and the scheduled work behind them, with a button for
 *  each piece of that work. */
'use client';

import { useEffect, useState } from 'react';
import {
  backUp,
  backups as readBackups,
  imageStatus,
  mirrorStatus,
  rollback,
  startCrawl,
  startUpdate,
  type Backups,
  type ImageStatus,
  type MirrorStatus,
} from '@/lib/admin';
import { errorText } from '@/lib/user';
import { Button, Card, Facts, JobFacts, Output, Trouble, bytes, span, when } from './parts';

/** While something runs the page follows it; otherwise it reads once. */
const FOLLOW_MS = 2000;

/** One service's answer, or why there is none. */
type Read<T> = { value: T | null; error: string | null };

async function read<T>(get: () => Promise<T>): Promise<Read<T>> {
  try {
    return { value: await get(), error: null };
  } catch (err) {
    return { value: null, error: errorText(err) };
  }
}

export function MirrorTab() {
  const [mirror, setMirror] = useState<Read<MirrorStatus> | null>(null);
  const [images, setImages] = useState<Read<ImageStatus> | null>(null);
  const [saved, setSaved] = useState<Read<Backups> | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [reads, setReads] = useState(0);
  const refresh = () => setReads(n => n + 1);

  useEffect(() => {
    let live = true;
    Promise.all([read(mirrorStatus), read(imageStatus), read(readBackups)]).then(([m, i, b]) => {
      if (!live) return;
      setMirror(m);
      setImages(i);
      setSaved(b);
    });
    return () => {
      live = false;
    };
  }, [reads]);

  const running = !!mirror?.value?.update.running || !!images?.value?.crawl.running;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setReads(n => n + 1), FOLLOW_MS);
    return () => clearInterval(timer);
  }, [running]);

  async function act(change: () => Promise<unknown>) {
    setBusy(true);
    setTrouble(null);
    try {
      await change();
    } catch (err) {
      setTrouble(errorText(err));
    }
    setConfirming(false);
    setBusy(false);
    refresh();
  }

  if (!mirror || !images || !saved) {
    return <div className="h-64 w-full animate-pulse rounded-lg bg-white/5" aria-hidden />;
  }

  const m = mirror.value;
  const live = m?.generations.find(g => g.schema === 'vndb');
  const prev = m?.generations.find(g => g.schema === 'vndb_prev');
  const crawl = images.value?.crawl;
  const report = crawl?.result;

  return (
    <div className="flex flex-col gap-4">
      <Trouble text={trouble} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Generations"
          aside={
            prev &&
            (confirming ? (
              <span className="flex items-center gap-2 text-xs">
                Roll back to {prev.code}?
                <Button danger disabled={busy} onClick={() => act(rollback)}>
                  Roll back
                </Button>
                <Button disabled={busy} onClick={() => setConfirming(false)}>
                  Keep
                </Button>
              </span>
            ) : (
              <Button disabled={busy || m?.update.running} onClick={() => setConfirming(true)}>
                Roll back…
              </Button>
            ))
          }
        >
          <Trouble text={mirror.error} />
          {m && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full whitespace-nowrap text-left text-xs [&_td]:pr-3 [&_th]:pr-3">
                  <thead className="text-muted">
                    <tr>
                      <th className="py-1 font-medium">Schema</th>
                      <th className="py-1 font-medium">Dump</th>
                      <th className="py-1 font-medium">Published</th>
                      <th className="py-1 font-medium">Imported</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {m.generations.map(g => (
                      <tr key={g.schema} className="border-t border-white/5">
                        <td className="py-1 font-mono">{g.schema}</td>
                        <td className="py-1">{g.code}</td>
                        <td className="py-1">{when(g.published_at)}</td>
                        <td className="py-1">
                          {g.finished_at ? (
                            when(g.finished_at)
                          ) : (
                            <span className="text-red-400">unfinished</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {m.ddl_stale && (
                <p className="text-xs text-amber-300">
                  The live generation was built by older schema code; the next import picks the
                  changes up.
                </p>
              )}
              <Facts
                rows={[
                  ['Database', `${bytes(m.database.bytes)}, ${m.database.server}`],
                  [
                    'Translations',
                    `${m.translations.terms.toLocaleString()} names, ${m.translations.passages.toLocaleString()} descriptions (${m.translations.lang})`,
                  ],
                ]}
              />
            </>
          )}
        </Card>

        <Card
          title="Update"
          aside={
            m && (
              <Button disabled={busy || m.update.running} onClick={() => act(startUpdate)}>
                {m.update.running ? 'Updating…' : 'Check now'}
              </Button>
            )
          }
        >
          {m && (
            <>
              <JobFacts
                job={m.update}
                extra={[
                  [
                    'Schedule',
                    `every ${span(m.schedule.every)}; after a failed download, ${span(m.schedule.retry_after)}`,
                  ],
                  ['Serving', live ? live.code : <span className="text-red-400">nothing</span>],
                ]}
              />
              <Output lines={m.update.output} />
              {m.archives && m.archives.length > 0 && (
                <div className="text-xs">
                  <p className="mb-1 text-muted">
                    Archives (
                    {m.dump_keep
                      ? `the newest ${m.dump_keep} are kept after each update`
                      : 'all are kept'}
                    )
                  </p>
                  <ul className="tabular-nums">
                    {m.archives.map(a => (
                      <li key={a.name} className="flex justify-between gap-3">
                        <span className="font-mono">{a.name}</span>
                        <span className="text-muted">{bytes(a.bytes)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </Card>

        <Card
          title="Images"
          aside={
            crawl && (
              <Button disabled={busy || crawl.running} onClick={() => act(startCrawl)}>
                {crawl.running ? 'Crawling…' : 'Crawl now'}
              </Button>
            )
          }
        >
          <Trouble text={images.error} />
          {crawl && images.value && (
            <>
              {report && report.known > 0 && (
                <Coverage held={report.held + report.fetched} known={report.known} />
              )}
              <JobFacts
                job={crawl}
                extra={[
                  [
                    'Last report',
                    report
                      ? `fetched ${report.fetched.toLocaleString()}, ${report.left.toLocaleString()} still missing`
                      : 'none yet',
                  ],
                  [
                    'Schedule',
                    `every ${span(images.value.schedule.every)}, ${images.value.schedule.per_run || 'all'} per run, ${span(images.value.schedule.delay)} apart`,
                  ],
                ]}
              />
            </>
          )}
        </Card>

        <Card
          title="User database backups"
          aside={
            saved.value && (
              <Button disabled={busy} onClick={() => act(backUp)}>
                Back up now
              </Button>
            )
          }
        >
          <Trouble text={saved.error} />
          {saved.value && (
            <>
              <Facts
                rows={[
                  [
                    'Schedule',
                    `when the newest is older than ${span(saved.value.every)} (checked every ${span(saved.value.check_every)}); keeps ${saved.value.keep || 'all'}`,
                  ],
                ]}
              />
              {saved.value.results.length === 0 ? (
                <p className="text-xs text-muted">No backups yet.</p>
              ) : (
                <ul className="text-xs tabular-nums">
                  {saved.value.results.map(c => (
                    <li key={c.name} className="flex justify-between gap-3">
                      <span>{when(c.taken)}</span>
                      <span className="text-muted">{bytes(c.bytes)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function Coverage({ held, known }: { held: number; known: number }) {
  const share = held / known;
  return (
    <div className="flex flex-col gap-1">
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-accent" style={{ width: `${(share * 100).toFixed(2)}%` }} />
      </div>
      <p className="text-xs text-muted tabular-nums">
        {held.toLocaleString()} of {known.toLocaleString()} images on disk (
        {(share * 100).toFixed(1)}%)
      </p>
    </div>
  );
}
