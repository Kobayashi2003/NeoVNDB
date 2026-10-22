/** Every main page at five widths: nothing spills sideways, in the page or in
 *  a column that scrolls on its own; and the pages that load in parts hold
 *  still while they do. Set E2E_SHOTS to a folder to keep a screenshot of each,
 *  for a look by eye. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const WIDTHS = [320, 390, 768, 1024, 1440];

const PUBLIC = {
  home: '/',
  novels: '/v',
  releases: '/r',
  characters: '/c',
  producers: '/p',
  staff: '/s',
  tags: '/g',
  traits: '/i',
  search: '/q?q=ever',
  novel: '/v17',
  graph: '/v17/rg',
  release: '/r1',
  character: '/c521',
  producer: '/p24',
  person: '/s1',
  tag: '/g7',
  trait: '/i1',
  api: '/api',
  login: '/login',
  register: '/register',
  lists: '/u',
};

/** What spills sideways: the page itself, and any box that scrolls on its own
 *  (overflow-y auto makes overflow-x auto too, so a too-wide child there only
 *  shows as a scrollbar inside it). Rows meant to scroll sideways, logs (a
 *  <pre> scrolls its long lines on purpose) and the graph's canvas are left out. */
async function spills(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const root = document.documentElement;
    if (root.scrollWidth > window.innerWidth + 1) {
      // Name the outermost things that reach past the edge, to know where to look.
      const past = [...document.querySelectorAll<HTMLElement>('body *')].filter(
        el =>
          el.getBoundingClientRect().right > window.innerWidth + 1 &&
          !(
            el.parentElement &&
            el.parentElement.getBoundingClientRect().right > window.innerWidth + 1
          ),
      );
      out.push(
        `page ${root.scrollWidth}px: ` +
          past
            .slice(0, 3)
            .map(el => `${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 60)}`)
            .join(' / '),
      );
    }
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const style = getComputedStyle(el);
      if (!/(auto|scroll)/.test(style.overflowY)) continue;
      if (el.tagName === 'PRE' || el.closest('.react-flow')) continue;
      if (/overflow-x-auto|grid-flow-col/.test(el.className)) continue;
      if (el.scrollWidth > el.clientWidth + 1) {
        const name = el.getAttribute('aria-label') ?? el.tagName.toLowerCase();
        out.push(`${name} ${el.scrollWidth - el.clientWidth}px over`);
      }
    }
    return out;
  });
}

/** Links and buttons that something fixed to the window sits on, with every
 *  scroll box and the page scrolled to its end: what is left under a floating
 *  bar there can never be reached. Next's own dev badge is not the site's. */
async function covered(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const scrollers = [
      document.scrollingElement!,
      ...document.querySelectorAll<HTMLElement>('[data-scroll-top]'),
    ];
    for (const s of scrollers) s.scrollTop = s.scrollHeight;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const fixedAncestor = (el: Element | null) => {
      for (let n = el; n; n = n.parentElement)
        if (getComputedStyle(n).position === 'fixed') return n as HTMLElement;
      return null;
    };
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('main a[href], main button')) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (box.bottom <= 0 || box.top >= window.innerHeight) continue;
      if (fixedAncestor(el)) continue;
      // The middle and the four corners: a bar over half a link still hides it.
      const points = [
        [box.left + box.width / 2, box.top + box.height / 2],
        [box.left + 2, box.top + 2],
        [box.right - 2, box.top + 2],
        [box.left + 2, box.bottom - 2],
        [box.right - 2, box.bottom - 2],
      ];
      for (const [x, y] of points) {
        if (x < 0 || x >= window.innerWidth || y < 0 || y >= window.innerHeight) continue;
        const top = document.elementFromPoint(x, y);
        if (!top || el.contains(top) || top.tagName.toLowerCase().startsWith('nextjs')) continue;
        const over = fixedAncestor(top);
        if (over) {
          out.push(`"${el.textContent?.trim().slice(0, 20)}" under ${over.className.slice(0, 40)}`);
          break;
        }
      }
    }
    return out;
  });
}

async function walk(page: Page, name: string, path: string) {
  const shots = process.env.E2E_SHOTS;
  if (shots) mkdirSync(shots, { recursive: true });
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(await spills(page), `${name} at ${width}px`).toEqual([]);
    if (shots) await page.screenshot({ path: join(shots, `${width}-${name}.png`) });
    expect(await covered(page), `${name} at ${width}px, scrolled to the end`).toEqual([]);
  }
}

for (const [name, path] of Object.entries(PUBLIC)) {
  test(`${name} fits at every width`, async ({ page }) => {
    await walk(page, name, path);
  });
}

test('a reader’s own pages fit at every width', async ({ page, user }) => {
  const list = (await (
    await user.call('POST', '/collections', { type: 'v', name: 'A list with a fairly long name' })
  ).json()) as { id: number };
  await user.call('POST', `/collections/${list.id}/marks/add`, {
    items: Array.from({ length: 30 }, (_, i) => `v${i + 1}`),
  });
  await user.call('PUT', '/ratings/v17', { rating: 4 });
  await walk(page, 'lists-signed-in', '/u');
  await walk(page, 'list', `/u/${list.id}`);
  await walk(page, 'ratings', '/u/ratings');
  await walk(page, 'account', '/account');
});

test('the selection bar never sits on the page links', async ({ page, user }) => {
  const list = (await (
    await user.call('POST', '/collections', { type: 'v', name: 'Paged' })
  ).json()) as { id: number };
  await user.call('POST', `/collections/${list.id}/marks/add`, {
    items: Array.from({ length: 60 }, (_, i) => `v${i + 1}`),
  });
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await page.goto(`/u/${list.id}`);
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Done selecting' })).toBeVisible();
    expect(await covered(page), `selecting at ${width}px`).toEqual([]);
    // Where the end of the list is a screen or more down, the button back to
    // the top is up too, above the bar. (Not at lg: the column is shorter.)
    const button = page.getByRole('button', { name: 'Back to the top' });
    if (width >= 1024) continue;
    await expect(button).toBeVisible();
    const toTop = (await button.boundingBox())!;
    const bar = (await page
      .getByRole('button', { name: 'Done selecting' })
      .locator('xpath=ancestor::div[contains(@class, "rounded-2xl")][1]')
      .boundingBox())!;
    expect(toTop.y + toTop.height, `the button clears the bar at ${width}px`).toBeLessThanOrEqual(
      bar.y,
    );
  }
});

test('the admin page fits at every width', async ({ page, admin }) => {
  void admin;
  await walk(page, 'admin', '/admin');
});

/** Layout shift while a page loads. Only meaningful on a slow line: on the
 *  loopback everything has arrived before the first paint. */
async function shift(page: Page, path: string): Promise<{ total: number; moved: string[] }> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  const total = await page.evaluate(
    () =>
      new Promise<{ total: number; moved: string[] }>(resolve => {
        let sum = 0;
        const moved: string[] = [];
        new PerformanceObserver(list => {
          for (const entry of list.getEntries() as (PerformanceEntry & {
            value: number;
            hadRecentInput: boolean;
            sources: {
              node: Node | null;
              previousRect: DOMRectReadOnly;
              currentRect: DOMRectReadOnly;
            }[];
          })[]) {
            if (entry.hadRecentInput) continue;
            sum += entry.value;
            // What moved, so a failure says where to look.
            const box = (r: DOMRectReadOnly) =>
              `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`;
            for (const { node, previousRect, currentRect } of entry.sources)
              if (node instanceof HTMLElement)
                moved.push(
                  `${node.tagName.toLowerCase()}.${node.className.toString().slice(0, 40)} ` +
                    `in ${node.parentElement?.className.toString().slice(0, 40)} ` +
                    `(${box(previousRect)} -> ${box(currentRect)})`,
                );
          }
        }).observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => resolve({ total: sum, moved }), 100);
      }),
  );
  await cdp.detach();
  return total;
}

test('pages hold still while they load on a slow line', async ({ page }) => {
  test.slow();
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const path of ['/', '/v', '/v17', '/c521', '/p24']) {
    const { total, moved } = await shift(page, path);
    expect(total, `${path}: ${moved.join(' / ')}`).toBeLessThan(0.02);
  }
});

test('a reader’s list holds still while it loads on a slow line', async ({ page, user }) => {
  test.slow();
  const list = (await (
    await user.call('POST', '/collections', { type: 'v', name: 'Shift' })
  ).json()) as { id: number };
  await user.call('POST', `/collections/${list.id}/marks/add`, {
    items: Array.from({ length: 30 }, (_, i) => `v${i + 1}`),
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  // A returning reader: the first visit leaves the name the header sizes its
  // account control by (NAME_COOKIE).
  await page.goto('/u');
  await page.waitForLoadState('networkidle');
  await user.call('PUT', '/ratings/v17', { rating: 4 });
  for (const path of ['/u', `/u/${list.id}`, '/u/ratings', '/account']) {
    const { total, moved } = await shift(page, path);
    expect(total, `${path}: ${moved.join(' / ')}`).toBeLessThan(0.02);
  }
});
