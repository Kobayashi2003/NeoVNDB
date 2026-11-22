/** Whether a navigation is under way and long enough to show: the store behind
 *  the bar along the top (components/layout/Navigation.tsx). Links start it
 *  there; code that navigates starts it through hooks/useNavigate.ts. */

/** Below this a navigation is instant to the eye, and a bar would flicker. */
const QUIET_MS = 120;
/** A navigation that never finishes (an error page, a dropped request) must
 *  not leave the bar or the transition mark running forever. */
const GIVE_UP_MS = 15_000;
/** Short fallback for popstate when the browser does not start a view
 *  transition or does not commit a new route. */
export const POPSTATE_MS = 500;

let moving = false;
let landed = true;
let activeTransitions = 0;
let settling: ReturnType<typeof setTimeout> | undefined;

function clearMoving() {
  clearTimeout(settling);
  settling = undefined;
  moving = false;
  document.documentElement.removeAttribute('data-moving');
}

function armMovingTimeout(after: number) {
  clearTimeout(settling);
  settling = setTimeout(clearMoving, after);
}

/** Marks the document as going to another page, which is what lets the page
 *  crossfade play (globals.css). React runs a view transition for commits that
 *  are not navigations too -- the first after hydration among them -- and the
 *  crossfade on a page that stayed where it was blanked it for a frame. */
export function markMoving(timeout = GIVE_UP_MS) {
  moving = true;
  landed = false;
  document.documentElement.setAttribute('data-moving', '');
  // A move that never lands on a new address (a dropped request, an error
  // page) must not leave the mark for a later non-navigation commit.
  armMovingTimeout(timeout);
}

/** Keeps `data-moving` on the document until the active view transition
 *  tears down. Removing it via a fixed timer used to strip `:root[data-moving]`
 *  mid-transition on tall pages (the dashboard), reverting `::view-transition-old`
 *  to the UA 250ms fade-out at opacity 1 and flashing the pre-fade frame. */
export function watchTransition(transition: ViewTransition) {
  if (!transition?.finished) return;
  activeTransitions++;
  // Extend any shorter fallback (e.g. popstate) while a transition is live.
  if (moving) armMovingTimeout(GIVE_UP_MS);
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    activeTransitions = Math.max(0, activeTransitions - 1);
    if (activeTransitions === 0 && landed) clearMoving();
  };
  // Handle rejection too so an aborted transition never raises unhandledrejection.
  transition.finished.then(end, end);
}

let pending = false;
let shown = false;
let timers: ReturnType<typeof setTimeout>[] = [];
const listeners = new Set<() => void>();
let stopped: { img: HTMLImageElement; src: string }[] = [];

/** Images still loading on the page being left are dropped. Over HTTP/1.1 a
 *  browser keeps six connections to a host, and covers vndb has not given the
 *  mirror yet take seconds each: six of them held every connection, and the
 *  next page's request queued behind them (15s measured). Taking the src away,
 *  rather than emptying it, ends the request without an error event, so the
 *  card is not marked broken. The mirror finishes the fetch regardless. */
function stopImages() {
  for (const img of document.images) {
    const src = img.getAttribute('src');
    if (img.complete || !src) continue;
    stopped.push({ img, src });
    img.removeAttribute('src');
  }
}

/** Puts back what is still on the page: a navigation that never came, or an
 *  image the new page kept as it was. One React gave a new src is left be. */
function restoreImages() {
  for (const { img, src } of stopped)
    if (img.isConnected && !img.hasAttribute('src')) img.setAttribute('src', src);
  stopped = [];
}

function announce() {
  document.documentElement.toggleAttribute('data-navigating', shown);
  for (const notify of listeners) notify();
}

function clear() {
  for (const t of timers) clearTimeout(t);
  timers = [];
}

/** Starts the sign for a navigation to href; nothing if it goes nowhere new. */
export function startNavigation(href: string) {
  let to: URL;
  try {
    to = new URL(href, location.href);
  } catch {
    return;
  }
  if (
    to.origin !== location.origin ||
    to.pathname + to.search === location.pathname + location.search
  )
    return;
  clear();
  markMoving();
  pending = true;
  stopImages();
  timers.push(
    setTimeout(() => {
      shown = pending;
      announce();
    }, QUIET_MS),
    setTimeout(finishNavigation, GIVE_UP_MS),
  );
}

/** Marks a browser history traversal (back/forward) for the crossfade while
 *  cancelling any abandoned forward navigation bar and pending-scroll flag. */
export function startPopState() {
  clear();
  restoreImages();
  if (pending || shown) {
    pending = shown = false;
    announce();
  }
  markMoving(POPSTATE_MS);
}

export function finishNavigation() {
  clear();
  landed = true;
  if (activeTransitions === 0) clearMoving();
  restoreImages();
  if (!pending && !shown) return;
  pending = shown = false;
  announce();
}

export function onNavigating(notify: () => void) {
  listeners.add(notify);
  return () => void listeners.delete(notify);
}

export function isNavigating() {
  return shown;
}

/** True from `startNavigation` until the new route finishes committing (never
 *  for initial load or browser back/forward). */
export function isPendingNavigation() {
  return pending;
}
