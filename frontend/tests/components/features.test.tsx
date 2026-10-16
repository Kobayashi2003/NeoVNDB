/** @vitest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { router } from '../router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GraphPanel } from '@/components/graph/GraphPanel';
import { ConditionBuilder } from '@/components/list/conditions/ConditionBuilder';
import { SearchField } from '@/components/layout/SearchField';
import { RatingStars } from '@/components/user/RatingStars';
import { SexLine } from '@/components/character/SexLine';
import { readSex } from '@/lib/characters';

/** Answers fetches by path, as the services would. */
function serve(routes: Record<string, (init?: RequestInit) => unknown>) {
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input), 'http://x');
    const route = Object.keys(routes).find(r => `${init?.method ?? 'GET'} ${url.pathname}` === r);
    if (!route) return new Response(JSON.stringify({ error: 'nope' }), { status: 404 });
    const body = routes[route](init);
    return body === undefined
      ? new Response(null, { status: 204 })
      : new Response(JSON.stringify(body), { status: 200 });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GraphPanel', () => {
  const props = {
    heading: <h1>Ever17</h1>,
    shown: 12,
    total: 17,
    switches: {
      covers: true,
      labels: true,
      years: false,
      direct: false,
      unofficial: false,
      overview: true,
    },
    kinds: [
      ['seq', 4],
      ['fan', 2],
    ] as [string, number][],
    hidden: new Set(['fan']),
    choosing: false,
  };

  it('opens its view panel and hands every control to the page', async () => {
    const calls = {
      onSwitch: vi.fn(),
      onRelation: vi.fn(),
      onShowAll: vi.fn(),
      onPath: vi.fn(),
      onLocate: vi.fn(),
      onFit: vi.fn(),
      onZoomIn: vi.fn(),
      onZoomOut: vi.fn(),
    };
    render(<GraphPanel {...props} {...calls} />);
    expect(screen.getByRole('heading', { name: 'Ever17' })).toBeInTheDocument();

    // Closed below 768px, which jsdom's matchMedia stub always reports.
    const view = screen.getByRole('button', { name: /view/i });
    expect(view).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(view);

    await userEvent.click(screen.getByRole('switch', { name: /year layers/i }));
    expect(calls.onSwitch).toHaveBeenCalledWith('years');
    await userEvent.click(screen.getByRole('button', { name: 'Show this title' }));
    expect(calls.onLocate).toHaveBeenCalledOnce();
    expect(screen.getByText(/showing 12 of 17/i)).toBeInTheDocument();
  });
});

describe('ConditionBuilder', () => {
  it('reads the address, counts as it is edited and applies on request', async () => {
    serve({ 'GET /vndbserve/vn': () => ({ results: [], count: 42, more: false }) });
    render(<ConditionBuilder type="v" path="/v" params={{ lang: 'en' }} current="olang=ja" />);
    await waitFor(() => expect(screen.getByText('42 matches')).toBeInTheDocument(), {
      timeout: 2000,
    });

    // Nothing has changed yet, so there is nothing to apply.
    const apply = screen.getByRole('button', { name: 'Apply' });
    expect(apply).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Edit as text' }));
    const text = screen.getByRole('textbox', { name: 'Conditions as text' });
    await userEvent.clear(text);
    await userEvent.type(text, 'olang=ja+has_anime=true');
    await userEvent.click(apply);
    expect(router.push).toHaveBeenCalledWith(
      `/v?lang=en&f=${encodeURIComponent('olang=ja+has_anime=true')}`,
    );
  });

  it('says what is wrong with text it cannot read, and will not apply it', async () => {
    serve({});
    render(<ConditionBuilder type="v" path="/v" params={{}} current="" />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit as text' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Conditions as text' }), '(olang=ja');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });
});

describe('SearchField', () => {
  it('goes to the search page, and not for blanks', async () => {
    render(<SearchField />);
    const box = screen.getByRole('searchbox');
    await userEvent.type(box, '   {Enter}');
    expect(router.push).not.toHaveBeenCalled();
    await userEvent.type(box, 'ever 17{Enter}');
    expect(router.push).toHaveBeenCalledWith('/q?q=ever%2017');
  });
});

describe('RatingStars', () => {
  it('shows, sets and clears the reader’s rating, and puts it back if that fails', async () => {
    let failing = false;
    const fetch = serve({
      'GET /userserve/session': () => ({ user: { id: 1, username: 'reader' } }),
      'GET /userserve/ratings/v17': () => ({ rating: 3 }),
      'PUT /userserve/ratings/v17': () => {
        if (failing) throw new Error('down');
      },
      'DELETE /userserve/ratings/v17': () => undefined,
    });
    render(<RatingStars id="v17" />);

    await screen.findByRole('button', { name: 'Clear your rating' });
    expect(screen.getByRole('button', { name: 'Rate 2 of 5' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Rate 5 of 5' }));
    const put = fetch.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ rating: 5 });

    await userEvent.click(screen.getByRole('button', { name: 'Clear your rating' }));
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Clear your rating' })).not.toBeInTheDocument();

    failing = true;
    await userEvent.click(screen.getByRole('button', { name: 'Rate 4 of 5' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Rate 4 of 5' })).toHaveAttribute(
        'aria-pressed',
        'false',
      ),
    );
  });
});

describe('SexLine', () => {
  it('hints that there is more, and says it once the level allows', () => {
    const { rerender } = render(<SexLine reading={readSex('f', 'm', 0)!} icon="icon-char-f" />);
    expect(screen.getByTitle('Something here is a spoiler')).toBeInTheDocument();
    rerender(<SexLine reading={readSex('f', 'm', 2)!} icon="icon-char-f" />);
    expect(screen.getByText(/Male/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Female' })).toBeInTheDocument();
  });
});
