/** `user`: a fresh account on the throwaway user service, signed in by cookie
 *  and with the page's /userserve calls sent there. Registered through the API,
 *  so no password is ever typed into a page. Skips without a test database. */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { test as base, expect } from '@playwright/test';

interface User {
  name: string;
  password: string;
  /** Calls the throwaway service as this user. */
  call(method: string, path: string, body?: unknown): Promise<Response>;
}

export const test = base.extend<{ user: User; admin: User }>({
  user: async ({ context, baseURL }, provide) => {
    const service = process.env.E2E_USERS_URL;
    test.skip(!service, 'set NEOVNDB_USERS_TEST_DB_URL to run signed-in tests');

    const name = `e2e_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const password = `pw-${Math.random().toString(36).slice(2)}`;
    const res = await fetch(`${service}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: name, password, email: '' }),
    });
    expect(res.status, await res.clone().text()).toBe(201);
    const token = /neovndb_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
    expect(token).toBeTruthy();

    const host = new URL(baseURL!).hostname;
    await context.addCookies([{ name: 'neovndb_session', value: token!, domain: host, path: '/' }]);
    await context.route('**/userserve/**', async route => {
      const url = route
        .request()
        .url()
        .replace(/^.*?\/userserve/, service!);
      await route.fulfill({ response: await route.fetch({ url }) });
    });

    const call = (method: string, path: string, body?: unknown) =>
      fetch(`${service}${path}`, {
        method,
        headers: { Cookie: `neovndb_session=${token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    await provide({ name, password, call });
  },

  /** `user`, made an administrator. The edge would ask the real user service
   *  about the services' admin routes, so the page's calls to them go to the
   *  services directly, as the edge would forward them once it said yes. */
  admin: async ({ user, context }, provide) => {
    execFileSync(process.env.E2E_USERS_EXE!, ['admin', user.name], {
      cwd: join(__dirname, '../../../backend/users'),
      env: { ...process.env, NEOVNDB_USERS_DB_URL: process.env.NEOVNDB_USERS_TEST_DB_URL },
    });
    // The deployment check's edge asks the throwaway service itself.
    const bypass = process.env.E2E_DEPLOYED
      ? []
      : [
          ['vndbserve', 'http://127.0.0.1:17031'],
          ['imgserve', 'http://127.0.0.1:17032'],
        ];
    for (const [prefix, service] of bypass) {
      await context.route(`**/${prefix}/admin/**`, async route => {
        const url = route
          .request()
          .url()
          .replace(new RegExp(`^.*?/${prefix}`), service);
        await route.fulfill({ response: await route.fetch({ url }) });
      });
    }
    await provide(user);
  },
});

export { expect };
