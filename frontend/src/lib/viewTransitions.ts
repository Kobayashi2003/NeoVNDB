/** The page transitions' two loose ends: what stays still through one
 *  (globals.css has the rest), and the way Chrome words one it aborts. */

import type { CSSProperties } from 'react';

/** For something that is the same on both sides of a move within one page --
 *  a page's heading, the controls over its results -- so a new page of results
 *  or a new order does not fade it out and in with the rest (globals.css,
 *  `.still`). The name has to be unique on the page; leaving for another page,
 *  where nothing carries it, it fades with the page as before. */
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

/** Chrome now words the abort of a transition in a hidden tab as "…invalid
 *  state. Document hidden", which React 19.3 does not recognise among the
 *  aborts it ignores, so switching tabs mid-navigation raised a recoverable
 *  error. Reworded to the form React knows; React already recovers either way.
 *
 *  Installed from instrumentation-client.ts, which runs before the app does:
 *  installed from a component, a transition started before that component's
 *  module loaded would still carry Chrome's wording. */
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
