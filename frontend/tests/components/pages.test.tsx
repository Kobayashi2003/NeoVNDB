/** @vitest-environment jsdom */
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MonthPicker } from '@/components/home/MonthPicker';
import { VNRelations } from '@/components/vn/VNRelations';
import { VNReleases } from '@/components/vn/VNReleases';
import { VNTags } from '@/components/vn/VNTags';
import { CharacterTraits } from '@/components/character/CharacterTraits';
import { ReleaseRow } from '@/components/vn/ReleaseRow';
import { usePrefs } from '@/hooks/usePrefs';
import type { Release, Tag, Trait } from '@/lib/types';

function tag(id: string, over: Partial<Tag> = {}): Tag {
  return {
    id,
    name: `Tag ${id}`,
    translation: null,
    category: 'cont',
    rating: 2,
    spoiler: 0,
    lie: false,
    ...over,
  };
}

function release(id: string, over: Partial<Release> = {}): Release {
  return {
    id,
    title: `Release ${id}`,
    alttitle: null,
    released: '2002-08-29',
    rtype: 'complete',
    minage: 15,
    patch: false,
    official: true,
    freeware: false,
    uncensored: false,
    has_ero: false,
    voiced: 4,
    resolution: '640x480',
    notes: null,
    animation: { story: null, ero: null },
    platforms: ['win'],
    media: [],
    engine: null,
    titles: [{ lang: 'ja', title: 'x', latin: null, mtl: false, main: true }],
    drm: [],
    extlinks: [],
    producers: [],
    ...over,
  } as unknown as Release;
}

/** Sets a preference from inside the tree, as the header menu would. */
function Prefs({ explicit }: { explicit: boolean }) {
  const { set, sexual } = usePrefs();
  const want = explicit ? 'explicit' : 'safe';
  if (sexual !== want) queueMicrotask(() => set({ sexual: want }));
  return null;
}

describe('VNTags', () => {
  it('orders by score, hides spoilers behind a reveal and sexual tags behind the content level', async () => {
    render(
      <>
        <Prefs explicit={false} />
        <VNTags
          tags={[
            tag('g1', { rating: 1 }),
            tag('g2', { rating: 3 }),
            tag('g3', { spoiler: 2 }),
            tag('g4', { category: 'ero' }),
          ]}
        />
      </>,
    );
    await act(async () => {});
    const names = screen.getAllByRole('link').map(a => a.textContent);
    expect(names[0]).toMatch(/^Tag g2/);
    expect(names[1]).toMatch(/^Tag g1/);
    expect(screen.queryByText('Tag g3')).not.toBeInTheDocument();
    expect(screen.queryByText('Tag g4')).not.toBeInTheDocument();
    expect(screen.getByText(/Set the sexual content level to Explicit/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /1 major spoiler/i }));
    expect(screen.getByText('Tag g3')).toBeInTheDocument();
  });
});

describe('CharacterTraits', () => {
  it("groups traits in vndb's order and strikes the untrue ones", () => {
    const traits: Trait[] = [
      { id: 'i2', name: 'Kind', group_name: 'Personality', spoiler: 0, lie: false },
      { id: 'i1', name: 'Brown', group_name: 'Hair', spoiler: 0, lie: true },
    ].map(t => ({ ...t, translation: null, group_translation: null }));
    render(<CharacterTraits traits={traits} spoiler={{ level: 0, setLevel: () => {} } as never} />);
    const groups = screen.getAllByText(/^(Hair|Personality)$/).map(p => p.textContent);
    expect(groups).toEqual(['Hair', 'Personality']);
    expect(screen.getByRole('link', { name: 'Brown' })).toHaveClass('line-through');
  });
});

describe('VNReleases', () => {
  it('groups by language, the original open and the rest folded', async () => {
    render(
      <VNReleases
        olang="ja"
        releases={[
          release('r1'),
          release('r2', {
            titles: [{ lang: 'en', title: 'y', latin: null, mtl: false, main: true }] as never,
          }),
        ]}
      />,
    );
    expect(screen.getByText('Release r1')).toBeInTheDocument();
    expect(screen.queryByText('Release r2')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /english/i }));
    expect(screen.getByText('Release r2')).toBeInTheDocument();
  });

  it('labels a row’s icons in words', () => {
    render(<ReleaseRow release={release('r1', { rtype: 'trial' })} striped={false} />);
    expect(screen.getByRole('img', { name: 'Trial' })).toHaveClass('icon-rttrial');
    expect(screen.getByRole('img', { name: 'Fully voiced' })).toHaveClass('icon-rel-v4');
    expect(screen.getByRole('img', { name: 'Windows' })).toBeInTheDocument();
  });
});

describe('VNRelations', () => {
  it('groups by relation and dims the unofficial', () => {
    render(
      <VNRelations
        relations={
          [
            { id: 'v2', title: 'Sequel', alttitle: null, relation: 'seq', official: true },
            { id: 'v3', title: 'Fan work', alttitle: null, relation: 'fan', official: false },
          ] as never
        }
      />,
    );
    expect(screen.getByRole('link', { name: 'Fan work' })).toHaveClass('opacity-60');
    expect(screen.getByRole('link', { name: 'Sequel' })).toHaveAttribute('href', '/v2');
  });
});

describe('MonthPicker', () => {
  it('steps across a year and opens a year of months', async () => {
    render(<MonthPicker path="/" params={{ page: '2' }} year={2026} month={12} />);
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', '/?year=2026&month=11');
    expect(links.at(-1)).toHaveAttribute('href', '/?year=2027&month=01');

    await userEvent.click(screen.getByRole('button', { name: /december 2026/i }));
    const panel = screen.getByRole('link', { name: 'Mar' }).closest('div')!;
    expect(within(panel).getByRole('link', { name: 'Mar' })).toHaveAttribute(
      'href',
      '/?year=2026&month=03',
    );
  });
});
