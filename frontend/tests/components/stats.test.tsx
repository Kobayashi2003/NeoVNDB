/** @vitest-environment jsdom */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Counted, CountedSite, SiteStats as Stats } from '@/lib/api';
import { SiteStats } from '@/components/stats/SiteStats';

const year = new Date().getFullYear();
const c = (key: string | number, count: number): Counted => ({ key: String(key), count });

const stats: Stats = {
  totals: [
    c('v', 1200),
    c('r', 3400),
    c('c', 900),
    c('p', 80),
    c('s', 150),
    c('g', 30),
    c('i', 40),
  ],
  added: { v: [c('2008-01', 2), c('2009-03', 5)] },
  vn_years: [c(2001, 3), c(year, 4), c(year + 2, 6)],
  vn_languages: [c('ja', 1000), c('en', 200)],
  vn_platforms: [c('win', 1100)],
  vn_lengths: [c(0, 50), c(3, 400)],
  vn_status: [c(0, 1100), c(1, 100)],
  // The top step holds the tens.
  vn_ratings: [c(60, 10), c(95, 3)],
  vn_top_rated: [
    { id: 'v17', name: 'Ever17', original: 'エバー17', count: 862 },
    { id: 'v2', name: 'Two', original: null, count: 840 },
  ],
  vn_most_voted: [],
  release_years: [c(2001, 3)],
  release_platforms: [c('win', 3000)],
  release_languages: [c('ja', 2000), c('en', 1400)],
  release_ages: [c(0, 100), c(18, 300)],
  release_voiced: [c(1, 20), c(4, 30)],
  release_kinds: [c('official', 3000), c('patch', 200)],
  release_engines: [c('KiriKiri', 400)],
  developers: [{ id: 'p24', name: 'KID', original: null, count: 40 }],
  publishers: [],
  producer_types: [c('co', 60), c('in', 20)],
  producer_languages: [c('ja', 70)],
  char_sex: [c('f', 500), c('m', 300)],
  char_gender: [],
  char_roles: { f: [c('main', 50), c('side', 300)], m: [c('main', 80), c('side', 100)] },
  char_ages: { f: [c(17, 10)], m: [c(20, 10)] },
  char_heights: {
    f: [c(150, 3), c(158, 4), c(240, 1)],
    m: [c(175, 5)],
  },
  char_bust: { f: [c(85, 6)] },
  char_cups: { f: [c('B', 4), c('D', 2)] },
  char_blood: { f: [c('a', 2), c('o', 5)], m: [c('a', 4)] },
  char_birth_months: { f: [c(3, 2)] },
  staff_gender: [c('f', 70)],
  staff_languages: [c('ja', 140)],
  staff_roles: [c('scenario', 50), c('art', 40)],
  staff_top: {
    scenario: [{ id: 's1', name: 'Writer', original: null, count: 20 }],
    art: [{ id: 's2', name: 'Painter', original: null, count: 12 }],
  },
  seiyuu: [],
  tag_categories: [c('cont', 20), c('ero', 10)],
  tags: {
    cont: [{ id: 'g1', name: 'Romance', original: null, translation: '恋愛', count: 600 }],
    ero: [{ id: 'g2', name: 'Sexual Content', original: null, count: 300 }],
  },
  trait_groups: [{ id: 'i1', name: 'Hair', original: null, count: 700 }],
  traits: { i1: [{ id: 'i2', name: 'Long Hair', original: null, count: 400 }] },
};
const counted: CountedSite = { generation: '20261028+t3', counted_at: '', stats };

/** In the scrolling box the page gives it, which its jump row reads. */
function show() {
  return render(
    <main data-scroll-top>
      <SiteStats counted={counted} />
    </main>,
  );
}

/** The section a chart or ranking heads, apart from the group around it. */
function section(name: string) {
  const heading = screen
    .getAllByRole('heading', { name })
    .find(h => !h.closest('section')!.hasAttribute('data-stat-group'))!;
  return within(heading.closest('section')!);
}

describe('SiteStats', () => {
  it('leads each total to the list it counts', () => {
    show();
    expect(screen.getByRole('link', { name: /1,200\s*Visual novels/ })).toHaveAttribute(
      'href',
      '/v',
    );
    expect(screen.getByRole('link', { name: /40\s*Traits/ })).toHaveAttribute('href', '/i');
  });

  it('lists its groups in the jump row', () => {
    show();
    const nav = within(screen.getByRole('navigation', { name: 'Sections' }));
    expect(nav.getAllByRole('link').map(a => a.textContent)).toEqual([
      'Overview',
      'Visual novels',
      'Releases',
      'Producers',
      'Characters',
      'Staff',
      'Tags and traits',
    ]);
  });

  it('follows one choice of sex through the character charts', async () => {
    show();
    const height = section('Height');
    expect(height.getByText(/^Median/)).toHaveTextContent(
      'Median 158 cm, of 13 characters with a height given; 1 fall outside the chart.',
    );
    // The sex list is everyone's either way, the choice lit in it.
    const sex = section('Sex');
    expect(sex.getByText('Female').closest('[aria-current]')).toBeNull();

    await userEvent.click(screen.getByRole('radio', { name: 'Female' }));
    expect(height.getByText(/^Median/)).toHaveTextContent(
      'Median 158 cm, of 8 female characters with a height given; 1 fall outside the chart.',
    );
    expect(sex.getByText('Female').closest('[aria-current]')).not.toBeNull();
    expect(sex.getByText('Male').closest('[aria-current]')).toBeNull();
    expect(
      section('Cup size').getByText('Of 6 female characters with a cup size given.'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'Male' }));
    expect(
      section('Cup size').getByText('No male characters with a cup size given.'),
    ).toBeInTheDocument();
    expect(
      section('Bust').getByText('No male characters with a bust measurement given.'),
    ).toBeInTheDocument();
  });

  it('counts roles in the order a title lists its characters', () => {
    show();
    const roles = section('Role')
      .getAllByRole('listitem')
      .map(li => li.textContent);
    expect(roles[0]).toMatch(/^Protagonist130/);
    expect(roles[1]).toMatch(/^Main Character/);
    expect(roles[2]).toMatch(/^Side Character400/);
  });

  it('says rating steps as the spans they cover, a ten in the top one', async () => {
    show();
    const rating = section('Rating');
    expect(rating.getByText(/median title is rated 6\.0–6\.49/)).toBeInTheDocument();
    expect(rating.getByLabelText('rated 9.5–10: 3 titles')).toBeInTheDocument();
    // A score, not a count, with no share beside it.
    const top = section('Highest rated');
    expect(top.getByRole('link', { name: /Ever17\s*8\.62/ })).toHaveAttribute('href', '/v17');
  });

  it('keeps announced years off the chart and says how many', () => {
    show();
    const released = screen
      .getAllByRole('heading', { name: 'Released in' })
      .map(h => within(h.closest('section')!))[0];
    expect(released.getByText(`6 more titles announced for after ${year}.`)).toBeInTheDocument();
    expect(released.queryByLabelText(new RegExp(`^${year + 2}:`))).toBeNull();
  });

  it('gives each row its share of the whole, and a few less than one per cent', () => {
    show();
    const kinds = section('Of every release');
    expect(kinds.getByText('Official').parentElement).toHaveTextContent('3,00088%');
    expect(section('Development').getByText('8%')).toBeInTheDocument();
  });

  it('switches a ranking to another category, translated where it can be', async () => {
    show();
    const tags = section('Most used tags');
    expect(tags.getByRole('link', { name: /恋愛/ })).toHaveAttribute('href', '/g1');
    await userEvent.click(tags.getByRole('button', { name: 'Category: Content' }));
    await userEvent.click(screen.getByRole('button', { name: /^Sexual Content/ }));
    expect(tags.getByRole('link', { name: /Sexual Content\s*300/ })).toHaveAttribute('href', '/g2');
    // A menu of one has nothing to choose.
    expect(
      section('Most used traits').queryByRole('button', { name: /^Group:/ }),
    ).not.toBeInTheDocument();
  });
});
