/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Collecting, SelectToggle } from '@/components/results/Collecting';
import { Results } from '@/components/results/Results';
import type { VNRow } from '@/lib/types';

vi.mock('@/hooks/useSession', () => ({
  useSession: () => ({ status: 'in', user: { id: 1, username: 'reader' } }),
}));

function vn(n: number): VNRow {
  return {
    id: `v${n}`,
    title: `Title ${n}`,
    alttitle: null,
    released: '2002-08-29',
    rating: 845,
    votecount: 10,
    languages: ['ja'],
    platforms: ['win'],
    devstatus: 0,
    image: null,
  };
}

describe('selecting results', () => {
  it('keeps every card as it was, so no cover loads and fades in again', () => {
    render(
      <Collecting type="v">
        <SelectToggle />
        <Results type="v" rows={[vn(1), vn(2)]} />
      </Collecting>,
    );
    const before = screen.getByText('Title 1').closest('a')!;

    fireEvent.click(screen.getByTitle('Select results to save them to a list'));
    expect(screen.getAllByRole('button', { name: 'Select' })).toHaveLength(2);
    expect(screen.getByText('Title 1').closest('a')).toBe(before);

    fireEvent.click(screen.getByRole('button', { pressed: true }));
    // The toggle alone: the cards' boxes are gone.
    expect(screen.getAllByRole('button', { name: 'Select' })).toHaveLength(1);
    expect(screen.getByText('Title 1').closest('a')).toBe(before);
  });
});
