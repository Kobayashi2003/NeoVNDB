import { defineConfig, devices } from '@playwright/test';

// Runs against a stack that is already up (start.ps1), through the edge.
// Nothing here starts the site; the setup only adds a throwaway user service
// when a test database is named. See README "Tests".
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  outputDir: './.results',
  globalSetup: './setup.ts',
  globalTeardown: './teardown.ts',
  // One worker: the throwaway user service is shared, and the dev server
  // compiles pages on first request, which parallel runs only slow down.
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:17030',
    viewport: { width: 1280, height: 900 },
  },
});
