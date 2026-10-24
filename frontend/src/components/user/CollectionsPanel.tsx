/** All of the reader's lists, grouped by type (a list's type decides what
 *  can go on it). Renaming and deleting happen here. */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, ListChecks, Pencil, Plus, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LIST, TYPES } from '@/lib/list';
import {
  createCollection,
  deleteCollection,
  renameCollection,
  RULES,
  errorText,
  type Collection,
} from '@/lib/user';
import { useSession } from '@/hooks/useSession';
import { refreshCollections, useCollections } from '@/hooks/useCollections';
import { SignInFirst } from './SignInFirst';

export function CollectionsPanel() {
  const session = useSession();
  // The same lists the column on a list's page shows, so a change here is
  // there too.
  const held = useCollections(session.status === 'in');
  const lists = held.lists;
  const [trouble, setError] = useState<string | null>(null);
  const error = trouble ?? held.error;

  if (session.status === 'out') {
    return (
      <SignInFirst next="/u" icon={ListChecks} title="Keep lists of your own">
        Collect visual novels, characters and the rest into lists, and find them on any device.
      </SignInFirst>
    );
  }
  // One block until the lists are in, then every shelf at once. Shelves drawn
  // with a row each while waiting were pushed down by any shelf above that
  // turned out to hold two lists (a CLS of 0.11 on a slow line); content that
  // replaces a placeholder moves nothing.
  if (session.status === 'unknown' || (lists === null && !held.error)) {
    // Keyed apart from the panel, so the panel is a new element rather than
    // this one grown: one that grows and moves counts as a shift.
    return (
      <div key="waiting" className="h-40 w-full animate-pulse rounded-lg bg-white/5" aria-hidden />
    );
  }

  const changed = () => void refreshCollections();

  return (
    <div key="lists" className="flex w-full flex-col gap-6">
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}

      {TYPES.map(type => (
        <Shelf
          key={type}
          type={type}
          lists={lists?.filter(l => l.type === type) ?? null}
          onError={setError}
          onChange={changed}
          onAdd={changed}
        />
      ))}
    </div>
  );
}

function Shelf({
  type,
  lists,
  onError,
  onChange,
  onAdd,
}: {
  type: string;
  lists: Collection[] | null;
  onError: (message: string | null) => void;
  onChange: () => void;
  onAdd: () => void;
}) {
  const [naming, setNaming] = useState(false);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = String(new FormData(form).get('name') ?? '').trim();
    if (!name) return;
    onError(null);
    try {
      await createCollection(type, name);
      onAdd();
      form.reset();
      setNaming(false);
    } catch (err) {
      onError(errorText(err));
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">{LIST[type].label}</h2>
        <button
          type="button"
          onClick={() => setNaming(on => !on)}
          className="flex shrink-0 items-center gap-1 text-xs text-muted transition-colors hover:text-white"
        >
          <Plus className="icon-text h-3 w-3" aria-hidden />
          New list
        </button>
      </div>

      {naming && (
        <form onSubmit={create} className="flex items-center gap-2">
          <input
            name="name"
            autoFocus
            maxLength={RULES.listName}
            placeholder={`A list of ${LIST[type].label.toLowerCase()}`}
            aria-label={`New ${LIST[type].label} list`}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-background/40 px-3 py-1.5 text-xs outline-none transition-colors focus:border-white/30"
          />
          <button
            type="submit"
            className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-background transition-colors hover:bg-accent-hover"
          >
            Create
          </button>
        </form>
      )}

      {lists === null ? (
        // Built from the same parts as a real row, so the placeholder has exactly
        // its height and nothing shifts when the rows arrive.
        <div
          className="flex animate-pulse items-center rounded-lg bg-white/5 px-3 py-1.5"
          aria-hidden
        >
          <span className="p-1">
            <span className="block h-3.5 w-3.5" />
          </span>
        </div>
      ) : lists.length === 0 ? (
        <p className="text-xs text-muted">No lists yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {lists.map(list => (
            <Row key={list.id} list={list} onError={onError} onChange={onChange} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({
  list,
  onError,
  onChange,
}: {
  list: Collection;
  onError: (message: string | null) => void;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function rename(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
    if (!name || name === list.name) {
      setEditing(false);
      return;
    }
    onError(null);
    try {
      await renameCollection(list.id, name);
      onChange();
      setEditing(false);
    } catch (err) {
      onError(errorText(err));
    }
  }

  async function remove() {
    onError(null);
    try {
      await deleteCollection(list.id);
      onChange();
    } catch (err) {
      onError(errorText(err));
      setConfirming(false);
    }
  }

  if (editing) {
    return (
      <li>
        <form
          onSubmit={rename}
          className="flex items-center gap-2 rounded-lg bg-surface px-3 py-1.5"
        >
          <input
            name="name"
            autoFocus
            defaultValue={list.name}
            maxLength={RULES.listName}
            aria-label="List name"
            className="min-w-0 flex-1 rounded border border-white/10 bg-background/40 px-2 py-1 text-xs outline-none transition-colors focus:border-white/30"
          />
          <IconButton type="submit" label="Save name" tone="accent">
            <Check className="h-3.5 w-3.5" aria-hidden />
          </IconButton>
          <IconButton label="Cancel" onClick={() => setEditing(false)}>
            <X className="h-3.5 w-3.5" aria-hidden />
          </IconButton>
        </form>
      </li>
    );
  }

  return (
    <li className="group flex items-center gap-2 rounded-lg bg-surface px-3 py-1.5">
      <Link href={`/u/${list.id}`} className="min-w-0 flex-1 truncate text-xs hover:text-accent">
        {list.name}
      </Link>
      <span className="shrink-0 tabular-nums text-xs text-muted">{list.count}</span>

      {confirming ? (
        // Two steps rather than a browser dialog: a list is gone for good, and
        // the question should be answerable where it was asked.
        <>
          <span className="shrink-0 text-xs text-muted">Delete?</span>
          <IconButton label="Yes, delete this list" tone="danger" onClick={remove}>
            <Check className="h-3.5 w-3.5" aria-hidden />
          </IconButton>
          <IconButton label="Keep it" onClick={() => setConfirming(false)}>
            <X className="h-3.5 w-3.5" aria-hidden />
          </IconButton>
        </>
      ) : (
        <>
          <IconButton label={`Rename ${list.name}`} onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </IconButton>
          <IconButton label={`Delete ${list.name}`} onClick={() => setConfirming(true)}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </IconButton>
        </>
      )}
    </li>
  );
}

function IconButton({
  label,
  tone,
  type = 'button',
  onClick,
  children,
}: {
  label: string;
  tone?: 'accent' | 'danger';
  type?: 'button' | 'submit';
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'shrink-0 rounded p-1 transition-colors hover:bg-white/10',
        tone === 'accent' && 'text-accent',
        tone === 'danger' && 'text-red-400',
        !tone && 'text-muted hover:text-white',
      )}
    >
      {children}
    </button>
  );
}
