/** @vitest-environment jsdom */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AgeRating } from '@/components/ui/AgeRating';
import { Icon } from '@/components/ui/Icon';
import { Name } from '@/components/ui/Name';
import { Section } from '@/components/ui/Section';
import { SectionNav } from '@/components/ui/SectionNav';
import { Segmented } from '@/components/ui/Segmented';
import { Spoiler, SpoilerScope } from '@/components/ui/Spoiler';
import { TabBar } from '@/components/ui/TabBar';
import { Selectable } from '@/components/ui/Selection';
import { Trouble } from '@/components/ui/Trouble';
import { usePrefs } from '@/hooks/usePrefs';
import { Collapsible } from '@/components/ui/Collapsible';
import { UserMenu } from '@/components/user/UserMenu';

describe('Section', () => {
  it('is an anchor the rail and a link can find', () => {
    const { container } = render(
      <Section title="Voiced characters" count={1234}>
        body
      </Section>,
    );
    const section = container.querySelector('section')!;
    expect(section.id).toBe('voiced-characters');
    expect(section.dataset.section).toBe('Voiced characters');
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('turns its heading into a button when it opens something', async () => {
    const open = vi.fn();
    render(
      <Section title="Characters" onTitleClick={open}>
        body
      </Section>,
    );
    await userEvent.click(screen.getByRole('button', { name: /characters/i }));
    expect(open).toHaveBeenCalledOnce();
  });
});

describe('SectionNav', () => {
  function page(titles: string[]) {
    return render(
      <div data-scroll-top>
        <SectionNav />
        {titles.map(t => (
          <Section key={t} title={t} count={t.length}>
            {t} body
          </Section>
        ))}
      </div>,
    );
  }
  const links = () =>
    within(screen.getByRole('navigation', { name: 'Sections' })).getAllByRole('link');

  it('lists the sections with their counts, and lights the one being read', () => {
    const { container } = page(['Description', 'Tags', 'Releases']);
    expect(links().map(a => [a.getAttribute('href'), a.textContent])).toEqual([
      ['#description', 'Description11'],
      ['#tags', 'Tags4'],
      ['#releases', 'Releases8'],
    ]);

    // jsdom lays nothing out: give the box a height and each section a place,
    // 500px apart, and scroll it.
    const box = container.querySelector<HTMLElement>('[data-scroll-top]')!;
    Object.defineProperty(box, 'clientHeight', { value: 600 });
    Object.defineProperty(box, 'scrollHeight', { value: 2000 });
    let scrollTop = 0;
    Object.defineProperty(box, 'scrollTop', { get: () => scrollTop });
    box.querySelectorAll('section').forEach((s, i) => {
      s.getBoundingClientRect = () => ({ top: i * 500 - scrollTop }) as DOMRect;
    });
    fireEvent.scroll(box);
    expect(links()[0]).toHaveAttribute('aria-current', 'location');
    scrollTop = 460;
    fireEvent.scroll(box);
    expect(links()[1]).toHaveAttribute('aria-current', 'location');
    // At the end of the box the last is lit, short as it may be.
    scrollTop = 1400;
    fireEvent.scroll(box);
    expect(links()[2]).toHaveAttribute('aria-current', 'location');
  });

  it('goes to a section on a click, without leaving the page', async () => {
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView');
    page(['Description', 'Tags', 'Releases']);
    await userEvent.click(links()[2]);
    expect(scrolled).toHaveBeenCalledOnce();
    expect(scrolled.mock.instances[0]).toBe(document.getElementById('releases'));
    expect(links()[2]).toHaveAttribute('aria-current', 'location');
  });

  it('stays out of the way of a short page', () => {
    // globals.css hides it with this rule, from the server's markup on.
    const hidden =
      '[data-scroll-top]:not(:has(section[data-section] ~ section[data-section] ~ section[data-section])) [data-section-nav]';
    const { unmount } = page(['Description', 'Tags']);
    expect(document.querySelector(hidden)).not.toBeNull();
    unmount();
    page(['Description', 'Tags', 'Releases']);
    expect(document.querySelector(hidden)).toBeNull();
  });

  it('follows sections that come and go', async () => {
    const { container } = page(['Description', 'Tags', 'Releases']);
    const extra = document.createElement('section');
    extra.id = 'similar';
    extra.dataset.section = 'Similar';
    await act(async () => {
      container.querySelector('[data-scroll-top]')!.append(extra);
    });
    expect(screen.getByRole('link', { name: 'Similar' })).toHaveAttribute('href', '#similar');
  });
});

describe('Spoiler', () => {
  it('opens on a click outside any scope', async () => {
    render(<Spoiler>the twist</Spoiler>);
    await userEvent.click(screen.getByRole('button', { name: 'Show spoiler' }));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('the twist')).toBeInTheDocument();
  });

  it("follows its page's control, which overrides a click", async () => {
    const { rerender } = render(
      <SpoilerScope level={0}>
        <Spoiler>x</Spoiler>
      </SpoilerScope>,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    rerender(
      <SpoilerScope level={1}>
        <Spoiler>x</Spoiler>
      </SpoilerScope>,
    );
    expect(screen.getByRole('button')).toBeInTheDocument();
    rerender(
      <SpoilerScope level={2}>
        <Spoiler>x</Spoiler>
      </SpoilerScope>,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('small pieces', () => {
  it('colours an age rating and says when there is none', () => {
    const { container, rerender } = render(<AgeRating minage={18} />);
    expect(container.textContent).toBe('18+');
    expect(container.firstElementChild).toHaveClass('text-red-400');
    rerender(<AgeRating minage={0} />);
    expect(container.textContent).toBe('All ages');
    rerender(<AgeRating minage={null} />);
    expect(container.textContent).toBe('—');
  });

  it('names an icon for a screen reader', () => {
    render(<Icon cls="icon-char-f" title="Female" />);
    expect(screen.getByRole('img', { name: 'Female' })).toHaveClass('icon-char-f');
  });

  it("shows a name in the reader's script", () => {
    function Toggle() {
      const { set, original } = usePrefs();
      return <button onClick={() => set({ original: !original })}>toggle</button>;
    }
    render(
      <>
        <Name name="Ever17" original="エバー17" />
        <Toggle />
      </>,
    );
    expect(screen.getByText('Ever17')).toBeInTheDocument();
    fireEvent.click(screen.getByText('toggle'));
    expect(screen.getByText('エバー17')).toBeInTheDocument();
    fireEvent.click(screen.getByText('toggle'));
  });

  it('chooses one of a segmented control', async () => {
    const change = vi.fn();
    render(
      <Segmented
        label="Level"
        value="a"
        onChange={change}
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
      />,
    );
    expect(screen.getByRole('radio', { name: 'A' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: 'B' }));
    expect(change).toHaveBeenCalledWith('b');
  });

  it('switches tabs', async () => {
    const change = vi.fn();
    render(
      <TabBar
        active="a"
        onChange={change}
        tabs={[
          { value: 'a', label: 'All', count: 3 },
          { value: 'b', label: 'Main' },
        ]}
      />,
    );
    expect(screen.getByRole('tab', { name: /all/i })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('tab', { name: 'Main' }));
    expect(change).toHaveBeenCalledWith('b');
  });

  it('selects a card instead of following it', async () => {
    const toggle = vi.fn();
    render(
      <Selectable on={false} grid onToggle={toggle}>
        <span>card</span>
      </Selectable>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Select' }));
    expect(toggle).toHaveBeenCalledOnce();
  });

  it('offers a way out of a page with nothing to show', () => {
    render(<Trouble title="Nothing here">Gone.</Trouble>);
    expect(screen.getByRole('link', { name: 'Front page' })).toHaveAttribute('href', '/');
  });
});

describe('holding still while a page loads', () => {
  it('clamps long prose from the first render, and offers the rest over the fade', async () => {
    // jsdom lays nothing out; this text measures tall.
    const was = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight')!;
    Object.defineProperty(Element.prototype, 'scrollHeight', {
      configurable: true,
      get: () => 600,
    });
    try {
      const { container } = render(
        <Collapsible>
          <p>long</p>
        </Collapsible>,
      );
      const body = container.querySelector<HTMLElement>('.overflow-hidden')!;
      expect(body.style.maxHeight).toBe('220px');
      // Over the fade, inside the clamped height: nothing below it moves.
      const more = screen.getByRole('button', { name: /show more/i });
      expect(more.parentElement).toHaveClass('absolute');
      await userEvent.click(more);
      expect(body.style.maxHeight).toBe('');
      expect(screen.getByRole('button', { name: /show less/i })).toBeInTheDocument();
    } finally {
      Object.defineProperty(Element.prototype, 'scrollHeight', was);
    }
  });

  it("draws the account control at last time's name while the session is asked for", () => {
    // A session that has not answered yet.
    vi.stubGlobal('fetch', () => new Promise(() => {}));
    try {
      const { container } = render(<UserMenu name="a-returning-reader" />);
      expect(container.textContent).toContain('a-returning-reader');
      expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
      expect(container.firstElementChild).toHaveClass('max-w-36', 'text-transparent');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
