/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Collecting, SelectToggle, useSelection } from '@/components/results/Collecting';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Stands in for the cards: one to pick, and what is chosen. */
function Cards() {
  const selection = useSelection();
  return (
    <>
      <button type="button" onClick={() => selection?.toggle('v17')}>
        Pick v17
      </button>
      <output data-testid="chosen">{selection?.chosen.join(',') ?? 'off'}</output>
    </>
  );
}

const page = (type: string) => (
  <Collecting type={type}>
    <SelectToggle />
    <Cards />
  </Collecting>
);

describe('Collecting', () => {
  // A catalog page's tabs change the type under the same results: works
  // chosen on one are no releases to save on the next.
  it('forgets a choice made on another type of thing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              user: { id: 1, username: 'reader', email: null, is_admin: false, created_at: '' },
            }),
          ),
      ),
    );
    const { rerender } = render(page('v'));
    await userEvent.click(await screen.findByRole('button', { name: /^Select/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Pick v17' }));
    expect(screen.getByTestId('chosen')).toHaveTextContent('v17');

    rerender(page('r'));
    expect(screen.getByTestId('chosen')).toBeEmptyDOMElement();
  });
});
