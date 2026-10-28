/** The page transitions' two loose ends: what stays still through one
 *  (globals.css has the rest), and the way Chrome words one it aborts. */

import type { CSSProperties } from 'react';

/** Keeps an element out of the page fade when a move stays on its page
 *  (globals.css `.still`). Name it part + path (`head/v`): unique on the page,
 *  the same either side of the move. */
export function still(name: string): CSSProperties {
  return {
    viewTransitionName: `still-${name.replace(/[^a-zA-Z0-9-]/g, '-')}`,
    viewTransitionClass: 'still',
  };
}

const REWORDED = Symbol.for('neovndb.reworded');
const ABORTED = 'Transition was aborted because of invalid state';

/** Matched by shape rather than `instanceof DOMException`, which fails for an
 *  exception made in another realm. */
function reword(error: unknown): unknown {
  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    'message' in error &&
    error.name === 'InvalidStateError' &&
    typeof error.message === 'string' &&
    error.message.startsWith(ABORTED) &&
    error.message !== ABORTED
  )
    return new DOMException(ABORTED, 'InvalidStateError');
  return error;
}

/** Chrome words a hidden-tab abort "…invalid state. Document hidden", which
 *  React 19.3 does not ignore and reports as a recoverable error; this rewords
 *  it to the form React knows. Installed from instrumentation-client.ts, so it
 *  is in place before any transition. */
export function rewordHiddenAborts(doc: Document) {
  // Once, though this module is evaluated again on every hot reload.
  if (!doc.startViewTransition || REWORDED in doc.startViewTransition) return;
  const start = doc.startViewTransition.bind(doc);
  doc.startViewTransition = Object.assign(
    (...args: Parameters<typeof start>) => {
      const transition = start(...args);
      const ready = transition.ready.catch((error: unknown) => {
        throw reword(error);
      });
      Object.defineProperty(transition, 'ready', { value: ready });
      return transition;
    },
    { [REWORDED]: true },
  ) as typeof doc.startViewTransition;
}
