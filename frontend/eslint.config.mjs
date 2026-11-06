import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // The build for checking (next.config.ts).
    '.next-check/**',
  ]),
  {
    // The server's locale on the server, the reader's in the browser: a
    // number written so differs between the two and breaks hydration.
    files: ['src/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='toLocaleString'][arguments.length=0]",
          message: 'Write a count with commas() from @/lib/format, the same on server and browser.',
        },
      ],
    },
  },
  prettier,
]);

export default eslintConfig;
