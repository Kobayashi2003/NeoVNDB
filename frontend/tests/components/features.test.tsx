/** @vitest-environment jsdom */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { router } from '../router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GraphPanel } from '@/components/graph/GraphPanel';
import { ConditionBuilder } from '@/components/list/conditions/ConditionBuilder';
import { SearchField } from '@/components/layout/SearchField';
import { RatingStars } from '@/components/user/RatingStars';
import { SexLine } from '@/components/ui/SexLine';
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

  // A chain of single "has one with" levels is one block headed by its path,
  // with one add button at its end rather than one per level.
  it('shows a chain of related conditions as one path', () => {
    serve({ 'GET /vndbserve/vn': () => ({ results: [], count: 1, more: false }) });
    render(
      <ConditionBuilder
        type="v"
        path="/v"
        params={{}}
        current="release=(producer=(relation=(type=co+lang=ja)))"
      />,
    );
    expect(screen.getByRole('button', { name: 'Release' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Producer' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Related producer:\s*has one with$/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Add a condition' })).toHaveLength(2);
  });

  it('keeps a level that has none, or is negated, in a block of its own', () => {
    serve({ 'GET /vndbserve/vn': () => ({ results: [], count: 1, more: false }) });
    render(
      <ConditionBuilder type="v" path="/v" params={{}} current="release!=(producer=(type=co))" />,
    );
    expect(screen.getByRole('button', { name: /^Release:\s*has none with$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Producer:\s*has one with$/ })).toBeInTheDocument();
  });

  it('goes down a relation in the add menu, and makes the whole condition at once', async () => {
    serve({ 'GET /vndbserve/vn': () => ({ results: [], count: 1, more: false }) });
    render(<ConditionBuilder type="v" path="/v" params={{}} current="olang=ja" />);
    await userEvent.click(screen.getByRole('button', { name: 'Add a condition' }));
    await userEvent.click(screen.getByRole('button', { name: 'Conditions on staff' }));
    const where = screen.getByRole('navigation', { name: 'Add to' });
    expect(where).toHaveTextContent('Visual novel');
    expect(where).toHaveTextContent('Staff');
    await userEvent.click(screen.getByRole('button', { name: 'Gender' }));
    await userEvent.click(screen.getByRole('button', { name: 'Female' }));
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(router.push).toHaveBeenLastCalledWith(
      `/v?${new URLSearchParams({ f: 'olang=ja+staff=(gender=f)' })}`,
    );
  });

  it('adds to a level further out from the path at the top of the menu', async () => {
    serve({ 'GET /vndbserve/vn': () => ({ results: [], count: 1, more: false }) });
    render(
      <ConditionBuilder type="v" path="/v" params={{}} current="release=(producer=(type=co))" />,
    );
    const adds = screen.getAllByRole('button', { name: 'Add a condition' });
    await userEvent.click(adds[0]);
    const where = screen.getByRole('navigation', { name: 'Add to' });
    await userEvent.click(within(where).getByRole('button', { name: /Release/ }));
    // A yes-or-no condition goes in as yes, with nothing more to choose.
    await userEvent.click(screen.getByRole('button', { name: 'Freeware' }));
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(router.push).toHaveBeenLastCalledWith(
      `/v?${new URLSearchParams({ f: 'release=(producer=(type=co)+freeware=true)' })}`,
    );
  });

  // A relation chosen by id takes several, and can ask for every one of them.
  it('turns several chosen by id into all of them', async () => {
    serve({ 'GET /vndbserve/staff': () => ({ results: [], count: 1, more: false }) });
    render(<ConditionBuilder type="s" path="/s" params={{}} current='vn="v17,v11"' />);
    await userEvent.click(screen.getByRole('button', { name: /^Credited on:/ }));
    expect(screen.getByRole('button', { name: /is any of these/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /is all of these/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(router.push).toHaveBeenLastCalledWith(
      `/s?${new URLSearchParams({ f: 'vn=v17+vn=v11' })}`,
    );
  });

  // Direct-only tags are not a filter of their own in the menu, but a switch
  // on the tag that swaps it for dtag, keeping what was chosen.
  it('offers direct-only tags as a switch on the tag, not as a filter of its own', async () => {
    serve({ 'GET /vndbserve/vn': () => ({ results: [], count: 1, more: false }) });
    render(<ConditionBuilder type="v" path="/v" params={{}} current="tag=g7:2.0" />);
    await userEvent.click(screen.getByRole('button', { name: 'Add a condition' }));
    expect(screen.getByRole('button', { name: 'Tag' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tag \(/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /trait/i })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    await userEvent.click(screen.getByRole('button', { name: /^Tag:/ }));
    await userEvent.click(screen.getByRole('button', { name: /Include child tags/ }));
    expect(screen.getByRole('button', { name: /^Tag \(direct only\):/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(router.push).toHaveBeenLastCalledWith(`/v?${new URLSearchParams({ f: 'dtag=g7:2.0' })}`);
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

    // Held until the click has shown, so the putting back is seen to happen
    // rather than a click that was never taken.
    failing = true;
    let fail: () => void = () => {};
    const failed = new Promise<void>(r => (fail = r));
    fetch.mockImplementationOnce(async () => {
      await failed;
      throw new Error('down');
    });
    await userEvent.click(screen.getByRole('button', { name: 'Rate 4 of 5' }));
    // Shown at once: the fourth star is now the one that clears it.
    expect(screen.getByRole('button', { name: 'Clear your rating' })).toBeInTheDocument();
    fail();
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
