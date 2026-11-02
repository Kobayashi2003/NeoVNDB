import { expect, test, type Page } from '@playwright/test';

// Every mirrored image a page loads, with its status. Images below the fold
// load lazily, so the page is scrolled to the end first.
// A 302 is an image not on disk yet, sent to vndb (NEOVNDB_IMAGE_MISS).
const served = (status: number) => status === 200 || status === 302;
async function images(page: Page, path: string) {
  const seen: { kind: string; status: number }[] = [];
  page.on('response', res => {
    const url = new URL(res.url());
    if (url.pathname.startsWith('/imgserve/img/'))
      seen.push({ kind: url.pathname.split('/')[3], status: res.status() });
  });
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  for (
    let y = 0;
    y < 20 && (await page.evaluate(() => innerHeight + scrollY < document.body.scrollHeight));
    y++
  ) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(150);
  }
  await page.waitForLoadState('networkidle');
  return seen;
}

test("list covers are vndb's thumbnails where it made them", async ({ page }) => {
  const seen = await images(page, '/v?sort=votecount&reverse=true');
  expect(seen.length).toBeGreaterThan(10);
  // Popular covers are recent and wide, so vndb made a cv.t for them.
  expect(seen.filter(i => i.kind === 'cv.t').length).toBeGreaterThan(0);
  expect(seen.every(i => i.kind === 'cv' || i.kind === 'cv.t')).toBe(true);
  expect(seen.filter(i => !served(i.status))).toEqual([]);
});

test('screenshots show st thumbnails and characters their originals', async ({ page }) => {
  // Narrower than lg, where a detail page scrolls as a whole rather than in
  // columns, so scrolling the window brings every lazy image in.
  await page.setViewportSize({ width: 800, height: 900 });
  const seen = await images(page, '/v17');
  const kinds = new Set(seen.map(i => i.kind));
  expect(kinds.has('st')).toBe(true);
  expect(kinds.has('ch')).toBe(true);
  expect(kinds.has('sf')).toBe(false); // full screenshots only in the viewer
  expect(seen.filter(i => !served(i.status))).toEqual([]);
});

test("a narrow cover's missing thumbnail is answered with the original", async ({ request }) => {
  // cv/39/10039 is 256px wide; vndb never made its cv.t. Fetching, or once a
  // redirect's fetch behind it has met the 404, the mirror answers with the
  // original. Until then a redirect sends the asker to vndb's own address;
  // how long that takes depends on what else is queued behind redirects, so
  // the turn from one to the other is left to the Go tests
  // (TestMissRedirectStopsForWhatVndbLacks).
  const thumb = await request.get('/imgserve/img/cv.t/39/10039.jpg', { maxRedirects: 0 });
  if (thumb.status() === 302) {
    expect(thumb.headers().location).toBe('https://t.vndb.org/cv.t/39/10039.jpg');
    expect(thumb.headers()['cache-control']).toBe('no-store');
    return;
  }
  expect(thumb.status()).toBe(200);
  const original = await request.get('/imgserve/img/cv/39/10039.jpg');
  expect(Buffer.compare(await thumb.body(), await original.body())).toBe(0);
});
