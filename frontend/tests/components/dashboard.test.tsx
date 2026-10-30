/** @vitest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Block, Plot } from '@/components/dashboard/Block';
import { Columns, type Column } from '@/components/dashboard/Columns';
import { Grow } from '@/components/dashboard/Grow';
import { Ranking, share } from '@/components/dashboard/Ranking';

const months: Column[] = Array.from({ length: 12 }, (_, i) => {
  const key = `2025-${String(i + 1).padStart(2, '0')}`;
  return { key, label: key, title: key, value: i === 4 ? 0 : i + 1 };
});

describe('Columns', () => {
  it('does not narrow to a column with nothing in it', async () => {
    const pick = vi.fn();
    render(<Columns data={months} unit="titles" label="By month" onPick={pick} />);
    const empty = screen.getByRole('button', { name: '2025-05: 0 titles' });
    expect(empty).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(empty);
    expect(pick).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '2025-06: 6 titles' }));
    expect(pick).toHaveBeenCalledWith('2025-06');
  });

  it('names a picked column without its neighbours printing over it', () => {
    // Twelve columns are labelled every other one, from the right: 12, 10, 8, ...
    const { container } = render(
      <Columns data={months} unit="titles" label="By month" picked="2025-11" onPick={() => {}} />,
    );
    const labels = [...container.querySelectorAll('[aria-hidden] > span')]
      .map(s => s.textContent)
      .filter(Boolean);
    expect(labels).toContain('2025-11');
    expect(labels).not.toContain('2025-12');
    expect(labels).not.toContain('2025-10');
    expect(labels).toContain('2025-08');
  });
});

describe('Ranking', () => {
  const rows = [
    { id: 'p1', href: '/p1', label: 'Key', count: 300 },
    { id: 'p2', href: '/p2', label: 'Leaf', count: 2 },
  ];

  it('says a share without rounding a few down to nothing', () => {
    expect(share(30, 120)).toBe('25%');
    expect(share(2, 1000)).toBe('<1%');
    expect(share(0, 1000)).toBe('—');
    expect(share(5, 0)).toBe('—');
  });

  it('links each row, with its share of the whole when given one', () => {
    render(<Ranking rows={rows} of={400} />);
    expect(screen.getByRole('link', { name: 'Key30075%' })).toHaveAttribute('href', '/p1');
    expect(screen.getByRole('link', { name: 'Leaf2<1%' })).toHaveAttribute('href', '/p2');
  });

  it('prints a count its own way, and toggles a pick', async () => {
    const pick = vi.fn();
    render(<Ranking rows={rows} format={n => `★${n}`} picked="p1" onPick={pick} />);
    const key = screen.getByRole('button', { name: 'Key★300' });
    expect(key).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(key);
    expect(pick).toHaveBeenCalledWith(undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Leaf★2' }));
    expect(pick).toHaveBeenCalledWith('p2');
  });

  it('says which row a choice elsewhere lights', () => {
    render(<Ranking rows={rows.map(r => ({ ...r, href: undefined }))} picked="p2" />);
    expect(screen.getByText('Leaf').closest('[aria-current]')).not.toBeNull();
    expect(screen.getByText('Key').closest('[aria-current]')).toBeNull();
  });

  it('holds rows while still counted, and says when there is nothing', () => {
    const { container, rerender } = render(<Ranking rows={undefined} />);
    expect(container.querySelectorAll('li')).toHaveLength(10);
    rerender(<Ranking rows={[]} />);
    expect(screen.getByText('Nothing yet.')).toBeInTheDocument();
  });
});

describe('bars and swaps', () => {
  it('grows a bar from nothing to its size', async () => {
    const { container, rerender } = render(<Grow along="width" size="40%" />);
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.style.width).toBe('0px');
    await waitFor(() => expect(bar.style.width).toBe('40%'));
    // Then from where it stands, not from nothing again.
    rerender(<Grow along="width" size="70%" />);
    expect(bar.style.width).toBe('70%');
  });

  it('settles in a new view rather than updating the old one in place', async () => {
    render(
      <Block title="Length" table={{ head: ['Length', 'Titles'], rows: [['Long', 4]] }}>
        <Plot>chart</Plot>
      </Block>,
    );
    const chart = screen.getByText('chart').parentElement!;
    expect(chart).toHaveClass('animate-swap-in');
    await userEvent.click(screen.getByRole('button', { name: 'Show as a table' }));
    expect(screen.getByRole('cell', { name: 'Long' }).closest('.animate-swap-in')).not.toBe(chart);
    expect(screen.getByRole('heading', { name: 'Length' })).toBeInTheDocument();
  });

  it('keeps a plot in place while its data changes, and swaps it when its view does', () => {
    const { rerender } = render(<Plot view="columns">a</Plot>);
    const first = screen.getByText('a');
    rerender(<Plot view="columns">b</Plot>);
    expect(screen.getByText('b')).toBe(first);
    rerender(<Plot view="calendar">c</Plot>);
    expect(screen.getByText('c')).not.toBe(first);
  });
});
