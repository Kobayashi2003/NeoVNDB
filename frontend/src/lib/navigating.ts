/** Whether a navigation is under way and long enough to show: the store behind
 *  the bar along the top (components/layout/Navigation.tsx). Links start it
 *  there; code that navigates starts it through hooks/useNavigate.ts. */

/** Below this a navigation is instant to the eye, and a bar would flicker. */
const QUIET_MS = 120;
/** A navigation that never finishes (an error page, a dropped request) must
 *  not leave the bar running forever. */
const GIVE_UP_MS = 15_000;
/** Longer than the page crossfade (globals.css), which stops the moment its
 *  mark goes. */
const CROSSFADE_MS = 600;
let settling: ReturnType<typeof setTimeout> | undefined;

/** Marks the document as going to another page, which is what lets the page
 *  crossfade play (globals.css). React runs a view transition for commits that
 *  are not navigations too -- the first after hydration among them -- and the
 *  crossfade on a page that stayed where it was blanked it for a frame. */
export function markMoving() {
  document.documentElement.setAttribute('data-moving', '');
  // A move that never lands on a new address (back over a #fragment, one
  // given up) must not leave the mark for the next commit that is no move.
  settleMoving(GIVE_UP_MS);
}

function settleMoving(after = CROSSFADE_MS) {
  clearTimeout(settling);
  settling = setTimeout(() => document.documentElement.removeAttribute('data-moving'), after);
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
  const to = new URL(href, location.href);
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

export function finishNavigation() {
  clear();
  settleMoving();
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
