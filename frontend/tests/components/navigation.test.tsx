/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';

/** Loads Navigation over a browser whose transitions all end with `error`,
 *  and starts one. */
async function abortedWith(error: DOMException) {
  vi.resetModules();
  const native = vi.fn(() => {
    const ready = Promise.reject(error);
    ready.catch(() => {});
    return { ready, finished: Promise.resolve(), skipTransition() {} } as unknown as ViewTransition;
  });
  document.startViewTransition = native as typeof document.startViewTransition;
  await import('@/components/layout/Navigation');
  return document
    .startViewTransition(() => {})
    .ready.then(
      () => null,
      (e: DOMException) => e,
    );
}

describe('page transitions', () => {
  it('words an abort in a hidden tab as React expects, so React ignores it', async () => {
    const seen = await abortedWith(
      new DOMException(
        'Transition was aborted because of invalid state. Document hidden',
        'InvalidStateError',
      ),
    );
    expect(seen?.name).toBe('InvalidStateError');
    expect(seen?.message).toBe('Transition was aborted because of invalid state');
  });

  it('passes any other failure on as it was', async () => {
    const other = new DOMException('Something else', 'AbortError');
    expect(await abortedWith(other)).toBe(other);
  });
});
