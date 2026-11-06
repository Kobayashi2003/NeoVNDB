/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CharacterInstances } from '@/components/character/CharacterInstances';
import type { SpoilerControl } from '@/hooks/useSpoilerLevel';
import type { Instance } from '@/lib/types';

const at = (level: 0 | 1 | 2): SpoilerControl => ({
  level,
  set: () => {},
  any: true,
  cycle: () => {},
  label: '',
  tone: 'none',
  className: '',
});

const instance = (id: string, name: string, spoiler: number): Instance => ({
  id,
  name,
  original: null,
  image: null,
  spoiler,
});

describe('CharacterInstances', () => {
  // That this character is secretly that one can be the twist.
  it('holds back the one this is an instance of while that is a spoiler', () => {
    const parent = instance('c1', 'The Culprit', 2);
    const here = instance('c2', 'The Stranger', 0);
    const { rerender } = render(
      <CharacterInstances parent={parent} instances={[here]} currentId="c2" spoiler={at(0)} />,
    );
    expect(screen.queryByText('The Culprit')).toBeNull();
    expect(screen.getByRole('button', { name: /1 major/i })).toBeVisible();

    rerender(
      <CharacterInstances parent={parent} instances={[here]} currentId="c2" spoiler={at(2)} />,
    );
    expect(screen.getByText('The Culprit')).toBeVisible();
  });
});
