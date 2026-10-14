/** Tag and trait names and descriptions, beside what they are called in the
 *  target language. Edits are live at once; exporting keeps them in the repo. */
'use client';

import { useEffect, useState } from 'react';
import {
  EXPORT_URL,
  translatable,
  translate,
  type Category,
  type Translatable,
  type TranslatablePage,
} from '@/lib/admin';
import { errorText } from '@/lib/user';
import { Segmented } from '@/components/ui/Segmented';
import { Button, FIELD, Trouble } from './parts';

export function TranslationsTab() {
  const [category, setCategory] = useState<Category>('tag');
  const [missing, setMissing] = useState(true);
  const [query, setQuery] = useState('');
  const [asked, setAsked] = useState('');
  const [page, setPage] = useState(1);
  const [held, setHeld] = useState<TranslatablePage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    translatable(category, page, missing, asked).then(
      got => {
        if (!live) return;
        setHeld(got);
        setError(null);
      },
      err => {
        if (live) setError(errorText(err));
      },
    );
    return () => {
      live = false;
    };
  }, [category, page, missing, asked]);

  const pages = held ? Math.max(1, Math.ceil(held.count / held.page_size)) : 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="What to translate"
          value={category}
          options={[
            { value: 'tag', label: 'Tags' },
            { value: 'trait', label: 'Traits' },
          ]}
          onChange={v => {
            setCategory(v);
            setPage(1);
          }}
          className="w-40"
        />
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={missing}
            onChange={e => {
              setMissing(e.target.checked);
              setPage(1);
            }}
          />
          Untranslated only
        </label>
        <form
          onSubmit={e => {
            e.preventDefault();
            setAsked(query.trim());
            setPage(1);
          }}
        >
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Name, group or translation"
            aria-label="Search translations"
            className={`${FIELD} w-56 py-1.5 text-xs`}
          />
        </form>
        <a
          href={EXPORT_URL}
          download="init.json"
          className="ml-auto text-xs text-accent hover:underline"
        >
          Export corpus
        </a>
      </div>

      {held && (
        <p className="text-xs text-muted tabular-nums">
          {held.total.toLocaleString()} {category}s: {held.missing_names.toLocaleString()} names and{' '}
          {held.missing_descriptions.toLocaleString()} descriptions untranslated. Edits show at
          once; export the corpus to keep them in the repository as internal/trans/init.json.
        </p>
      )}
      <Trouble text={error} />

      {held && held.results.length === 0 && <p className="text-sm text-muted">Nothing here.</p>}
      <div className="flex flex-col gap-3">
        {held?.results.map(t => (
          // Keyed by the stored text too, so a saved row starts from what was saved.
          <Row key={`${t.id}:${t.name_to}:${t.description_to}`} category={category} item={t} />
        ))}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-xs">
          <Button disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="tabular-nums text-muted">
            {page} / {pages}
          </span>
          <Button disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

function Row({ category, item }: { category: Category; item: Translatable }) {
  const letter = category === 'tag' ? 'g' : 'i';
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-white/5 bg-surface p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <a
          href={`/${letter}${item.id}`}
          target="_blank"
          rel="noreferrer"
          className="font-semibold hover:underline"
        >
          {item.name}
        </a>
        {item.group && <span className="text-xs text-muted">in {item.group}</span>}
        <span className="text-xs text-muted tabular-nums">
          {letter}
          {item.id} · {item.items.toLocaleString()} uses
        </span>
      </div>
      <Field category={category} id={item.id} field="name" saved={item.name_to} />
      {item.description && (
        <div className="grid gap-3 lg:grid-cols-2">
          <p className="whitespace-pre-wrap rounded-lg bg-background/40 p-3 text-xs leading-relaxed text-white/80">
            {item.description}
          </p>
          <Field category={category} id={item.id} field="description" saved={item.description_to} />
        </div>
      )}
    </article>
  );
}

function Field({
  category,
  id,
  field,
  saved,
}: {
  category: Category;
  id: number;
  field: 'name' | 'description';
  saved: string;
}) {
  const [draft, setDraft] = useState(saved);
  const [stored, setStored] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await translate(category, id, field, draft);
      setStored(draft.trim());
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  }

  const changed = draft.trim() !== stored;
  const label = field === 'name' ? 'Name translation' : 'Description translation';
  return (
    <div className="flex flex-col gap-1.5">
      {field === 'name' ? (
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && changed) void save();
          }}
          aria-label={label}
          placeholder="Untranslated"
          className={FIELD}
        />
      ) : (
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          aria-label={label}
          placeholder="Untranslated. Keep the markup ([url=…], [spoiler]) exactly as in the English."
          rows={5}
          className={`${FIELD} min-h-24 text-xs leading-relaxed`}
        />
      )}
      <div className="flex items-center gap-2">
        {changed && (
          <Button disabled={busy} onClick={() => void save()}>
            {draft.trim() === '' ? 'Remove' : 'Save'}
          </Button>
        )}
        {!changed && stored && <span className="text-[0.6875rem] text-muted">Saved</span>}
        <Trouble text={error} />
      </div>
    </div>
  );
}
