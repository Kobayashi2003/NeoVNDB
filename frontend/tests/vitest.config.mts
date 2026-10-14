import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests live apart from the app: nothing under src/ imports from here, and
// the root tsconfig leaves this directory out of the Next build.
const root = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  root,
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
