import { describe, expect, it, vi } from 'vitest';
import { rewordHiddenAborts, still } from '@/lib/viewTransitions';

/** A document whose transitions all end with `error`, patched, and one
 *  transition started on it. */
async function abortedWith(error: unknown) {
  const native = vi.fn(() => {
    const ready = Promise.reject(error);
    ready.catch(() => {});
    return { ready, finished: Promise.resolve(), skipTransition() {} } as unknown as ViewTransition;
  });
  const doc = { startViewTransition: native } as unknown as Document;
  rewordHiddenAborts(doc);
  return doc
    .startViewTransition(() => {})
    .ready.then(
      () => null,
      (e: unknown) => e,
    );
}

describe('page transitions', () => {
  it('words an abort in a hidden tab as React expects, so React ignores it', async () => {
    const seen = (await abortedWith(
      new DOMException(
        'Transition was aborted because of invalid state. Document hidden',
        'InvalidStateError',
      ),
    )) as DOMException;
    expect(seen.name).toBe('InvalidStateError');
    expect(seen.message).toBe('Transition was aborted because of invalid state');
  });

  it('knows the abort by its shape, not by which realm made it', async () => {
    const foreign = {
      name: 'InvalidStateError',
      message: 'Transition was aborted because of invalid state. Document hidden',
    };
    expect(((await abortedWith(foreign)) as DOMException).message).toBe(
      'Transition was aborted because of invalid state',
    );
  });

  it('passes any other failure on as it was', async () => {
    const other = new DOMException('Something else', 'AbortError');
    expect(await abortedWith(other)).toBe(other);
  });

  it('patches a document once', () => {
    const doc = { startViewTransition: vi.fn() } as unknown as Document;
    rewordHiddenAborts(doc);
    const patched = doc.startViewTransition;
    rewordHiddenAborts(doc);
    expect(doc.startViewTransition).toBe(patched);
  });
});

describe('still', () => {
  it('names an element as a still layer, with a name a stylesheet can carry', () => {
    expect(still('controls-v/p24')).toEqual({
      viewTransitionName: 'still-controls-v-p24',
      viewTransitionClass: 'still',
    });
  });
});
