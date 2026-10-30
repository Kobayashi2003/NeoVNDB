/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { linkPrefs } from '@/hooks/accountPrefs';
import { currentPrefs, usePrefs } from '@/hooks/usePrefs';
import { DEFAULTS } from '@/lib/prefs';
import { accountPrefs, saveAccountPrefs } from '@/lib/user';

vi.mock('@/lib/user', () => ({
  accountPrefs: vi.fn(),
  saveAccountPrefs: vi.fn(() => Promise.resolve()),
}));

const read = vi.mocked(accountPrefs);
const save = vi.mocked(saveAccountPrefs);

/** Lets the account's answer, and the saves queued after it, settle. */
const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 0)));

describe('preferences on the account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    linkPrefs(false);
    const { result } = renderHook(() => usePrefs());
    act(() => result.current.set(DEFAULTS));
  });

  it('are taken on when the account has them, and changes go back', async () => {
    read.mockResolvedValue({ spoiler: 2, original: true });
    const { result } = renderHook(() => usePrefs());
    linkPrefs(true);
    await settle();
    expect(result.current.spoiler).toBe(2);
    expect(result.current.original).toBe(true);
    // Taking them on is not a change to send back.
    expect(save).not.toHaveBeenCalled();

    act(() => result.current.set({ graphYears: true }));
    act(() => result.current.set({ spoiler: 1 }));
    await settle();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls.at(-1)?.[0]).toMatchObject({ graphYears: true, spoiler: 1 });
  });

  it('are given this device’s when the account has none', async () => {
    read.mockResolvedValue(null);
    const { result } = renderHook(() => usePrefs());
    act(() => result.current.set({ violence: 'brutal' }));
    linkPrefs(true);
    await settle();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ violence: 'brutal' }));
  });

  it('are left alone when the account cannot be read, or once signed out', async () => {
    read.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => usePrefs());
    linkPrefs(true);
    await settle();
    act(() => result.current.set({ spoiler: 2 }));
    await settle();
    expect(save).not.toHaveBeenCalled();

    read.mockResolvedValue(null);
    linkPrefs(true);
    linkPrefs(false);
    await settle();
    act(() => result.current.set({ spoiler: 1 }));
    await settle();
    // The answer for the session that ended links nothing.
    expect(save).not.toHaveBeenCalled();
    expect(currentPrefs().spoiler).toBe(1);
  });
});
