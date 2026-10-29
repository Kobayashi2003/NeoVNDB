/** @vitest-environment jsdom */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FilterBar } from '@/components/list/FilterBar';
import { Pagination } from '@/components/results/Pagination';
import { Results } from '@/components/results/Results';
import { SearchBox } from '@/components/list/SearchBox';
import { SortLinks } from '@/components/results/SortLinks';
import { SortMenu } from '@/components/results/SortMenu';
import { Tabs } from '@/components/results/Tabs';
import { VNSimilar } from '@/components/vn/VNSimilar';
import { FILTERS } from '@/lib/filters';
import { LIST } from '@/lib/list';
import type { VNRow } from '@/lib/types';
import { router } from '../router';

const hrefs = (root: HTMLElement) =>
  within(root)
    .getAllByRole('link')
    .map(a => a.getAttribute('href'));

function vn(n: number): VNRow {
  return {
    id: `v${n}`,
    title: `Title ${n}`,
    alttitle: null,
    released: '2002-08-29',
    rating: 845,
    votecount: 10,
    length: null,
    length_minutes: null,
    languages: ['ja'],
    platforms: ['win'],
    devstatus: 0,
    image: null,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Pagination', () => {
  it('draws a window around the page, both ends, and gaps', () => {
    render(<Pagination path="/v" params={{ lang: 'en' }} page={10} count={480} pageSize={24} />);
    const nav = screen.getByRole('navigation', { name: 'Pages' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map(a => a.textContent),
    ).toEqual(['‹', '1', '9', '10', '11', '20', '›']);
    expect(within(nav).getByText('10')).toHaveAttribute('aria-current', 'page');
    // Page 1 is the bare address; the rest of the query stays.
    expect(within(nav).getByText('1')).toHaveAttribute('href', '/v?lang=en');
    expect(within(nav).getAllByRole('button', { name: 'Go to page' })).toHaveLength(2);
  });

  it('is nothing for a single page', () => {
    const { container } = render(
      <Pagination path="/v" params={{}} page={1} count={5} pageSize={24} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('jumps to a typed page, clamped to the range', async () => {
    render(<Pagination path="/v" params={{}} page={1} count={480} pageSize={24} />);
    await userEvent.click(screen.getByRole('button', { name: 'Go to page' }));
    const box = screen.getByRole('spinbutton');
    await userEvent.type(box, '99');
    // jsdom does not submit a number field on Enter, as a browser does.
    fireEvent.submit(box.closest('form')!);
    expect(router.push).toHaveBeenCalledWith('/v?page=20');
  });
});

describe('sorting', () => {
  const sorts = LIST.v.sorts;

  it('flips the active sort and starts a new one from its useful end', () => {
    const { container } = render(
      <SortLinks
        path="/v"
        params={{ page: '3' }}
        sorts={sorts}
        active="rating"
        reverse
        menu={false}
      />,
    );
    const links = hrefs(container as HTMLElement);
    // Rating defaults to descending, so ascending is spelled out.
    expect(links).toContain('/v?sort=rating&reverse=false');
    expect(links).toContain('/v?sort=title');
  });

  it('flips back to a sort read its own way without saying so', () => {
    const { container } = render(
      <SortLinks
        path="/v"
        params={{ sort: 'rating', reverse: 'false' }}
        sorts={sorts}
        active="rating"
        reverse={false}
        menu={false}
      />,
    );
    expect(hrefs(container as HTMLElement)).toContain('/v?sort=rating');
  });

  it('offers the same as a menu', async () => {
    render(<SortMenu path="/v" params={{}} sorts={sorts} active="rating" reverse />);
    await userEvent.click(screen.getByRole('button', { name: /sort/i }));
    expect(screen.getByRole('link', { name: /title/i })).toHaveAttribute('href', '/v?sort=title');
    expect(screen.getByRole('link', { name: 'Ascending' })).toHaveAttribute(
      'href',
      '/v?sort=rating&reverse=false',
    );
    expect(screen.getByRole('link', { name: 'Descending' })).toHaveAttribute(
      'href',
      '/v?sort=rating',
    );
  });
});

describe('Tabs', () => {
  const tab = (value: string, label: string, count: number) => ({
    value,
    label,
    count,
    type: 'v',
    filters: {},
  });

  it('links each tab and resets what belonged to the last list', () => {
    render(
      <Tabs
        path="/p1"
        params={{ page: '2', sort: 'title' }}
        tabs={[tab('dev', 'Developed', 5), tab('pub', 'Published', 1234)]}
        active="pub"
      />,
    );
    expect(screen.getByRole('tab', { name: /developed/i })).toHaveAttribute('href', '/p1');
    expect(screen.getByRole('tab', { name: /published/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('shows a single tab as a label', () => {
    render(<Tabs path="/s1" params={{}} tabs={[tab('a', 'Credited on', 22)]} active="a" />);
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByText('Credited on')).toBeInTheDocument();
  });
});

describe('SearchBox', () => {
  it('searches from the first page', async () => {
    render(<SearchBox path="/v" params={{ page: '4', lang: 'en' }} initial="" />);
    await userEvent.type(screen.getByRole('searchbox'), 'ever17{Enter}');
    expect(router.push).toHaveBeenCalledWith('/v?lang=en&search=ever17');
  });
});

describe('FilterBar', () => {
  const platform = FILTERS.v.find(f => f.key === 'platform')!;

  it('toggles a value within a list filter', async () => {
    render(
      <FilterBar type="v" path="/v" params={{ platform: 'win', page: '2' }} filters={[platform]} />,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 })),
    );
    await userEvent.click(screen.getByRole('button', { name: /platform/i }));
    expect(screen.getByRole('link', { name: /linux/i })).toHaveAttribute(
      'href',
      `/v?platform=${encodeURIComponent('win,lin')}`,
    );
    expect(screen.getByRole('link', { name: 'Windows' })).toHaveAttribute('href', '/v');
    // A failed count leaves the menu as it was.
    expect(screen.getByRole('link', { name: 'Windows' }).textContent).toBe('Windows');
  });

  it('shows what each choice would leave, asked for under the other filters', async () => {
    const fetch = vi.fn<(input: string) => Promise<Response>>(
      async () => new Response(JSON.stringify({ counts: { win: 3902, lin: 0 } }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetch);
    render(
      <FilterBar type="v" path="/v" params={{ length: '3', page: '2' }} filters={[platform]} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /platform/i }));

    await waitFor(() => expect(screen.getByText('3,902')).toBeInTheDocument());
    const url = new URL(String(fetch.mock.calls[0][0]), 'http://x');
    expect(url.pathname).toBe('/vndbserve/facets/vn/platform');
    expect(url.searchParams.get('length')).toBe('3');
    expect(url.searchParams.has('page')).toBe(false);
    expect(url.searchParams.get('values')?.split(',')).toContain('lin');
    // A choice that would leave nothing is dimmed, still there to pick.
    expect(screen.getByRole('link', { name: /linux/i })).toHaveClass('text-muted/60');
  });
});

describe('Results', () => {
  it('lays covers in a grid, or one sideways row', () => {
    const rows = [vn(1), vn(2)];
    const { container, rerender } = render(<Results type="v" rows={rows} />);
    expect(container.firstElementChild).toHaveClass('grid-cols-2');
    rerender(<Results type="v" rows={rows} strip />);
    expect(container.firstElementChild).toHaveClass('grid-flow-col', 'overflow-x-auto');
    expect(hrefs(container as HTMLElement)).toEqual(['/v1', '/v2']);
  });

  it('lists name-first types as rows, never as a strip', () => {
    const { container } = render(
      <Results
        type="p"
        strip
        rows={[{ id: 'p1', name: 'KID', original: null, lang: 'ja', type: 'co' }]}
      />,
    );
    expect(container.firstElementChild).not.toHaveClass('grid-flow-col');
    expect(screen.getByText('KID')).toBeInTheDocument();
  });

  it('shows on each card the value it is sorted by', () => {
    const timed = { ...vn(1), votecount: 8808, length: 4, length_minutes: 1987 };
    const { rerender } = render(<Results type="v" rows={[timed]} sort="rating" />);
    expect(screen.getByTitle('8,808 votes')).toHaveTextContent('8.8K');
    rerender(<Results type="v" rows={[timed]} sort="length_minutes" />);
    expect(screen.getByTitle('Length')).toHaveTextContent('33h');
    expect(screen.queryByTitle('8,808 votes')).toBeNull();

    const cast = {
      id: 'c1',
      name: 'Touko',
      original: null,
      sex: 'f',
      age: 17,
      height: 158,
      image: null,
      vns: [
        { id: 'v2', title: 'Secret', alttitle: null, role: 'main', spoiler: 2 },
        { id: 'v66', title: 'CROSS†CHANNEL', alttitle: null, role: 'primary', spoiler: 0 },
      ],
    };
    rerender(<Results type="c" rows={[cast]} sort="age" />);
    expect(screen.getByText('Age 17')).toBeInTheDocument();
    // The weightiest role among works where appearing is no spoiler.
    expect(screen.getByText('CROSS†CHANNEL')).toBeInTheDocument();
    expect(screen.queryByText('Secret')).toBeNull();
    rerender(<Results type="c" rows={[cast]} sort="height" />);
    expect(screen.getByText('158 cm')).toBeInTheDocument();
    rerender(<Results type="c" rows={[cast]} sort="name" />);
    expect(screen.queryByText(/Age|cm$/)).toBeNull();
  });
});

describe('VNSimilar', () => {
  it('pages the row and greys an arrow at its end', async () => {
    const { container } = render(
      <VNSimilar rows={Array.from({ length: 20 }, (_, i) => vn(i + 1))} />,
    );
    const strip = container.querySelector<HTMLElement>('.overflow-x-auto')!;
    Object.defineProperty(strip, 'clientWidth', { value: 800 });
    Object.defineProperty(strip, 'scrollWidth', { value: 3600 });
    let left = 0;
    Object.defineProperty(strip, 'scrollLeft', { get: () => left });
    const scrollBy = vi.fn();
    strip.scrollBy = scrollBy;
    fireEvent.scroll(strip);

    const back = screen.getByRole('button', { name: 'Earlier similar works' });
    const more = screen.getByRole('button', { name: 'More similar works' });
    expect(back).toBeDisabled();
    expect(more).toBeEnabled();
    await userEvent.click(more);
    expect(scrollBy).toHaveBeenCalledWith({ left: 680, behavior: 'smooth' });

    left = 2800;
    await act(async () => fireEvent.scroll(strip));
    expect(more).toBeDisabled();
    expect(back).toBeEnabled();
  });
});
