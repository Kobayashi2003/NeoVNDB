/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  finishNavigation,
  isPendingNavigation,
  markMoving,
  POPSTATE_MS,
  startNavigation,
  startPopState,
  watchTransition,
} from '@/lib/navigating';

/** A fake ViewTransition whose `finished` promise the test settles on cue. */
function fakeTransition() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const finished = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const transition = {
    ready: Promise.resolve(),
    updateCallbackDone: Promise.resolve(),
    finished,
    skipTransition() {},
  } as unknown as ViewTransition;
  return { transition, resolve, reject };
}

const flush = () => Promise.resolve().then(() => Promise.resolve());

describe('navigating transition lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    finishNavigation();
  });

  afterEach(() => {
    finishNavigation();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    document.documentElement.removeAttribute('data-moving');
    document.documentElement.removeAttribute('data-navigating');
  });

  it('holds data-moving past 600ms until transition.finished resolves', async () => {
    startNavigation('/u');
    const vt = fakeTransition();
    watchTransition(vt.transition);
    finishNavigation();

    // Well past the old 600ms fixed cutoff: the transition is still playing.
    vi.advanceTimersByTime(2000);
    expect(document.documentElement.hasAttribute('data-moving')).toBe(true);

    vt.resolve();
    await flush();
    expect(document.documentElement.hasAttribute('data-moving')).toBe(false);
  });

  it('clears data-moving cleanly when an aborted transition rejects finished', async () => {
    startNavigation('/u/ratings');
    const vt = fakeTransition();
    watchTransition(vt.transition);
    finishNavigation();

    vt.reject(new DOMException('Aborted', 'AbortError'));
    await flush();
    expect(document.documentElement.hasAttribute('data-moving')).toBe(false);
  });

  it('keeps data-moving across overlapping navigations even if the first ends before the second starts', async () => {
    startNavigation('/u');
    const first = fakeTransition();
    watchTransition(first.transition);
    finishNavigation();

    // User clicks again while the first transition is still active.
    startNavigation('/v');
    first.resolve();
    await flush();
    // Second navigation has not landed yet, so the mark must stay.
    expect(document.documentElement.hasAttribute('data-moving')).toBe(true);

    const second = fakeTransition();
    watchTransition(second.transition);
    finishNavigation();
    expect(document.documentElement.hasAttribute('data-moving')).toBe(true);

    second.resolve();
    await flush();
    expect(document.documentElement.hasAttribute('data-moving')).toBe(false);
  });

  it('keeps data-moving until both overlapping transitions settle when the second starts first', async () => {
    startNavigation('/u');
    const first = fakeTransition();
    watchTransition(first.transition);
    finishNavigation();

    startNavigation('/v');
    const second = fakeTransition();
    watchTransition(second.transition);
    first.resolve();
    await flush();
    finishNavigation();
    expect(document.documentElement.hasAttribute('data-moving')).toBe(true);

    second.resolve();
    await flush();
    expect(document.documentElement.hasAttribute('data-moving')).toBe(false);
  });

  it('clears data-moving immediately on commit when no view transition started', () => {
    startNavigation('/u');
    expect(document.documentElement.hasAttribute('data-moving')).toBe(true);
    finishNavigation();
    expect(document.documentElement.hasAttribute('data-moving')).toBe(false);
  });

  it('does not set data-moving for a non-navigation view transition', async () => {
    const vt = fakeTransition();
    watchTransition(vt.transition);
    expect(document.documentElement.hasAttribute('data-moving')).toBe(false);
    vt.resolve();
    await flush();
    expect(document.documentElement.hasAttribute('data-moving')).toBe(false);
  });

  it('drops popstate mark after its short fallback if nothing starts, and clears pending state', () => {
    startNavigation('/v');
    expect(isPendingNavigation()).toBe(true);
    startPopState();
    expect(isPendingNavigation()).toBe(false);
    expect(document.documentElement.hasAttribute('data-moving')).toBe(true);

    vi.advanceTimersByTime(POPSTATE_MS - 1);
    expect(document.documentElement.hasAttribute('data-moving')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(document.documentElement.hasAttribute('data-moving')).toBe(false);
  });

  it('extends a popstate mark when a view transition actually starts', async () => {
    startPopState();
    const vt = fakeTransition();
    watchTransition(vt.transition);
    finishNavigation();

    vi.advanceTimersByTime(POPSTATE_MS + 500);
    expect(document.documentElement.hasAttribute('data-moving')).toBe(true);

    vt.resolve();
    await flush();
    expect(document.documentElement.hasAttribute('data-moving')).toBe(false);
  });

  it('ignores malformed, cross-origin, and same-address hrefs without setting data-moving', () => {
    for (const href of ['http://[::1', 'https://other.example/u', location.pathname + '#section']) {
      startNavigation(href);
      expect(document.documentElement.hasAttribute('data-moving'), href).toBe(false);
      expect(isPendingNavigation(), href).toBe(false);
    }
  });

  it('still clears data-moving after the 15s safety ceiling if finished never settles', async () => {
    markMoving();
    const vt = fakeTransition();
    watchTransition(vt.transition);
    finishNavigation();

    vi.advanceTimersByTime(15_000);
    expect(document.documentElement.hasAttribute('data-moving')).toBe(false);
    // Clean up activeTransitions for subsequent tests.
    vt.resolve();
    await flush();
  });
});
