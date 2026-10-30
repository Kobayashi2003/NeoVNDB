/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Columns, type Column } from '@/components/dashboard/Columns';

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
