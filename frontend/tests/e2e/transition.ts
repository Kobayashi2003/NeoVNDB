import type { Page } from '@playwright/test';

type Box = { left: number; top: number; width: number };
type Held = { page: Box; header: number | null };
type Watch = { held?: Held | null; watching?: boolean };

/** Navigates with `go` and looks at the page change part way through the old
 *  page's fade. Returns where the page's main column was before, and where the
 *  page's layer is drawn at that moment: the two should be the same box. */
export async function midway(page: Page, go: () => Promise<unknown>) {
  const before = await page.locator('main').evaluate(main => {
    const r = main.getBoundingClientRect();
    return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width) };
  });
  await page.evaluate(() => {
    const w = window as unknown as Watch;
    w.held = null;
    // Client navigations share one document: wrap once, record each time.
    if (w.watching) return;
    w.watching = true;
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = ((...args: Parameters<typeof start>) => {
      const t = start(...args);
      void t.ready.then(() => {
        if (w.held !== null) return;
        const at = (name: string) => getComputedStyle(document.documentElement, name);
        const runs = document
          .getAnimations()
          .filter(a => (a.effect as KeyframeEffect | null)?.pseudoElement);
        const times = runs.map(a => a.currentTime);
        for (const a of runs) a.currentTime = 50;
        const groups = runs
          .map(a => (a.effect as KeyframeEffect).pseudoElement!)
          .filter(p => p.startsWith('::view-transition-group('));
        const style = at(groups.find(p => !/\((root|site-header)\)$/.test(p))!);
        const m = new DOMMatrix(style.transform);
        w.held = {
          page: {
            left: Math.round(m.e),
            top: Math.round(m.f),
            width: Math.round(parseFloat(style.width)),
          },
          header: groups.includes('::view-transition-group(site-header)')
            ? Number(at('::view-transition-group(site-header)').zIndex)
            : null,
        };
        runs.forEach((a, i) => (a.currentTime = times[i]));
      });
      return t;
    }) as typeof document.startViewTransition;
  });
  await go();
  await page.waitForFunction(() => !!(window as unknown as Watch).held);
  const held = await page.evaluate(() => (window as unknown as Watch).held!);
  return { before, held };
}
