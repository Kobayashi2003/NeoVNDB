/** "New list" at the foot of a save menu: it becomes a name field, and
 *  `onCreate` makes the list and saves into it. The words can change, for
 *  naming something else the same way (a search). */
'use client';

import { useState } from 'react';
import { Check, Loader2, Plus, X } from 'lucide-react';
import { MenuDivider, menuItem } from '@/components/ui/Menu';
import { errorText, RULES } from '@/lib/user';

export function NewList({
  onCreate,
  onError,
  label = 'New list',
  placeholder = 'List name',
  submit: submitLabel = 'Create list',
  field = 'New list name',
}: {
  onCreate: (name: string) => Promise<void>;
  onError: (message: string | null) => void;
  label?: string;
  placeholder?: string;
  submit?: string;
  /** The field's accessible name. */
  field?: string;
}) {
  const [naming, setNaming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = String(new FormData(form).get('name') ?? '').trim();
    if (!name) return;

    setBusy(true);
    onError(null);
    try {
      await onCreate(name);
      form.reset();
      setNaming(false);
    } catch (err) {
      onError(errorText(err));
    }
    setBusy(false);
  }

  if (!naming) {
    return (
      <>
        <MenuDivider />
        <button
          type="button"
          onClick={() => setNaming(true)}
          className={menuItem({ className: 'text-muted' })}
        >
          <Plus className="icon-text size-3.5 shrink-0" aria-hidden />
          {label}
        </button>
      </>
    );
  }

  return (
    <>
      <MenuDivider />
      <form onSubmit={submit} className="flex items-center gap-1 px-1 py-0.5">
        {/* autoFocus because opening this form is the whole of the intent to
            type into it, and it is one click deep inside a menu. */}
        <input
          name="name"
          autoFocus
          maxLength={RULES.listName}
          placeholder={placeholder}
          aria-label={field}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-background/40 px-2 py-1 text-xs outline-none transition-colors focus:border-white/30"
        />
        <button
          type="submit"
          disabled={busy}
          aria-label={submitLabel}
          className="shrink-0 rounded p-1 text-accent transition-colors hover:bg-white/10 disabled:opacity-40"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Check className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            setNaming(false);
            onError(null);
          }}
          aria-label="Cancel"
          className="shrink-0 rounded p-1 text-muted transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </form>
    </>
  );
}
