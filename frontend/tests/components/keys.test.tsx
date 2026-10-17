/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { Shortcuts } from '@/components/layout/Shortcuts';
import { TabBar } from '@/components/ui/TabBar';
import { Segmented } from '@/components/ui/Segmented';
import { Lightbox } from '@/components/ui/Lightbox';
import { ActionBar } from '@/components/ui/Selection';
import { useSidewaysWheel } from '@/hooks/useSidewaysWheel';
import { router } from '../router';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** jsdom lays nothing out, and Shortcuts only uses controls that are shown. */
function laidOut() {
  const was = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent')!;
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() {
      return this.parentElement;
    },
  });
  onTestFinished(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', was);
  });
}

describe('Shortcuts', () => {
  it('pages with the arrows by using the page links', async () => {
    laidOut();
    const next = vi.fn((e: Event) => e.preventDefault());
    render(
      <>
        <Shortcuts />
        <nav aria-label="Pages">
          <Link href="/v?page=3" aria-label="Next" onClick={next as never}>
            ›
          </Link>
        </nav>
      </>,
    );
    await userEvent.keyboard('{ArrowRight}');
    expect(next).toHaveBeenCalledOnce();
    // Nothing to go back to, so the key does nothing.
    await userEvent.keyboard('{ArrowLeft}');
    expect(next).toHaveBeenCalledOnce();
  });

  it('leaves the keys alone while typing, and lets a control that used one keep it', async () => {
    laidOut();
    const next = vi.fn((e: Event) => e.preventDefault());
    render(
      <>
        <Shortcuts />
        <input aria-label="typing" />
        <TabBar
          active="a"
          onChange={() => {}}
          tabs={[
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ]}
        />
        <nav aria-label="Pages">
          <Link href="/v?page=2" aria-label="Next" onClick={next as never}>
            ›
          </Link>
        </nav>
      </>,
    );
    await userEvent.click(screen.getByLabelText('typing'));
    await userEvent.keyboard('{ArrowRight}/j');
    await userEvent.click(screen.getByRole('tab', { name: 'A' }));
    await userEvent.keyboard('{ArrowRight}');
    expect(next).not.toHaveBeenCalled();
  });

  it('focuses the search on /, or goes to the search page without one', async () => {
    laidOut();
    const { unmount } = render(
      <>
        <Shortcuts />
        {/* The header comes first in the page; the list's own search wins. */}
        <header>
          <input type="search" aria-label="Search everything" />
        </header>
        <main>
          <input type="search" aria-label="Search this list" />
        </main>
      </>,
    );
    await userEvent.keyboard('/');
    expect(document.activeElement).toBe(screen.getByLabelText('Search this list'));
    unmount();

    render(<Shortcuts />);
    await userEvent.keyboard('/');
    expect(router.push).toHaveBeenCalledWith('/q');
  });

  it('moves between sections with j and k', async () => {
    laidOut();
    const went: string[] = [];
    render(
      <>
        <Shortcuts />
        <nav data-section-nav>
          {['description', 'tags', 'staff'].map((id, i) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={i === 1 ? 'location' : undefined}
              onClick={e => {
                e.preventDefault();
                went.push(id);
              }}
            >
              {id}
            </a>
          ))}
        </nav>
      </>,
    );
    await userEvent.keyboard('jk');
    expect(went).toEqual(['staff', 'description']);
  });

  it('lists the keys on ?, and closes on Escape', async () => {
    render(<Shortcuts />);
    await userEvent.keyboard('?');
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('rows of choices', () => {
  it('move the choice with the arrows, Home and End', async () => {
    function Tabs() {
      const [at, setAt] = useState('a');
      return (
        <TabBar
          active={at}
          onChange={setAt}
          tabs={['a', 'b', 'c'].map(v => ({ value: v, label: v.toUpperCase() }))}
        />
      );
    }
    render(<Tabs />);
    await userEvent.click(screen.getByRole('tab', { name: 'A' }));
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'B' })).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'B' }));
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'C' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'A' })).toHaveAttribute('aria-selected', 'true');
  });

  it('do the same in a segmented control', async () => {
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
    await userEvent.click(screen.getByRole('radio', { name: 'A' }));
    change.mockClear();
    await userEvent.keyboard('{ArrowLeft}');
    expect(change).toHaveBeenCalledWith('b');
  });
});

describe('Lightbox', () => {
  const images = [1, 2, 3].map(n => ({ url: `/img/${n}.jpg`, blurred: false, caption: `#${n}` }));

  it('steps with the keys and the wheel, one image per turn', async () => {
    const onIndex = vi.fn();
    render(<Lightbox images={images} index={0} onIndex={onIndex} onClose={() => {}} />);
    await userEvent.keyboard('{ArrowRight}');
    expect(onIndex).toHaveBeenLastCalledWith(1);
    await userEvent.keyboard('{End}');
    expect(onIndex).toHaveBeenLastCalledWith(2);
    onIndex.mockClear();
    const viewer = screen.getByRole('dialog', { name: 'Screenshot viewer' });
    fireEvent.wheel(viewer, { deltaY: 120 });
    fireEvent.wheel(viewer, { deltaY: 120 });
    expect(onIndex).toHaveBeenCalledOnce();
  });
});

describe('the selection bar', () => {
  it('marks the page for room at its foot, and closes on Escape', async () => {
    const close = vi.fn();
    const { unmount } = render(
      <ActionBar
        error={null}
        chosen={0}
        allOnPage={false}
        canSelectPage
        onAll={() => {}}
        onClose={close}
      >
        <span />
      </ActionBar>,
    );
    expect(document.documentElement).toHaveAttribute('data-selecting');
    await userEvent.keyboard('{Escape}');
    expect(close).toHaveBeenCalledOnce();
    unmount();
    expect(document.documentElement).not.toHaveAttribute('data-selecting');
  });
});

describe('a row that scrolls sideways', () => {
  it('turns with the wheel until either end, then lets the page scroll', () => {
    function Row() {
      const ref = useRef<HTMLDivElement>(null);
      useSidewaysWheel(ref);
      return <div ref={ref} data-testid="row" />;
    }
    render(<Row />);
    const row = screen.getByTestId('row');
    Object.defineProperty(row, 'scrollWidth', { value: 1000 });
    Object.defineProperty(row, 'clientWidth', { value: 400 });
    let left = 0;
    Object.defineProperty(row, 'scrollLeft', { get: () => left });
    row.scrollBy = ((o: ScrollToOptions) => {
      left += o.left ?? 0;
    }) as typeof row.scrollBy;

    expect(fireEvent.wheel(row, { deltaY: 100 })).toBe(false); // used, page held
    expect(left).toBe(100);
    left = 600;
    expect(fireEvent.wheel(row, { deltaY: 100 })).toBe(true); // at the end: the page's
    expect(fireEvent.wheel(row, { deltaX: 50, deltaY: 10 })).toBe(true); // a sideways swipe
  });
});
