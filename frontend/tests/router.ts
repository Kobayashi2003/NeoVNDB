/** The router setup.ts puts behind next/navigation, for tests to look at
 *  where a component sent the reader. */
import { vi } from 'vitest';

export const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() };
