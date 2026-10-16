/** Shared by every test file. Component tests opt into a DOM with a
 *  `@vitest-environment jsdom` comment; the rest run in plain Node, where none
 *  of this applies. */
import { afterEach, vi } from 'vitest';
import { createElement, type AnchorHTMLAttributes } from 'react';
import { router } from './router';

// Next's Link needs the app router mounted around it; a page under test is
// not, and what a test cares about is where the link goes.
vi.mock('next/link', () => ({
  default: ({ href, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) =>
    createElement('a', { href, ...rest }),
}));

vi.mock('next/navigation', async () => ({
  useRouter: () => router,
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error('notFound');
  },
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));

if (typeof window !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // What jsdom leaves out and the components reach for.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= function () {};
  Element.prototype.scrollBy ??= function () {};
  window.matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
