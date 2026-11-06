import { afterEach, describe, expect, it, vi } from 'vitest';

const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

const { generation } = await import('@/lib/api');

async function sent(): Promise<string | undefined> {
  const fetch = vi.fn(async () => Response.json({ code: '20260101' }));
  vi.stubGlobal('fetch', fetch);
  await generation();
  const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1];
  return (init.headers as Record<string, string> | undefined)?.cookie;
}

describe('the session a page is drawn for', () => {
  afterEach(() => {
    jar.clear();
    vi.unstubAllGlobals();
  });

  it('asks as nobody with no session', async () => {
    expect(await sent()).toBeUndefined();
  });

  // The user service reads only the name its setting gives; the other can be
  // left over from before the setting changed.
  it('passes both session cookies on when both are held', async () => {
    jar.set('__Host-neovndb_session', 'old');
    jar.set('neovndb_session', 'live');
    expect(await sent()).toBe('__Host-neovndb_session=old; neovndb_session=live');
  });
});
