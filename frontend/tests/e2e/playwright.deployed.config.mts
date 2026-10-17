import { defineConfig } from '@playwright/test';
import base from './playwright.config.mjs';

// The same tests against a site configured as a deployment is: the ceilings in
// the services' .env.sample, a production build, an edge of its own. setup.ts
// starts all of it (on 17036-17038) and needs NEOVNDB_USERS_TEST_DB_URL.
process.env.E2E_DEPLOYED = '1';

export default defineConfig({
  ...base,
  // A production build is slower to start each page cold than the dev server
  // is warm; the setup builds it first, which takes a while too.
  globalTimeout: 30 * 60_000,
  use: { ...base.use, baseURL: 'http://127.0.0.1:17036' },
});
