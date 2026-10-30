/** One choice out of several, as a pill naming the current one that opens a
 *  menu of the rest: the site's own look for what a native select would do,
 *  whose popup the browser draws in the system's colours. */
'use client';

import { Fragment, useState } from 'react';
import { MenuDivider, MenuLabel, MenuMark, MenuPanel, menuItem } from './Menu';
import { Chevron, pill } from './Pill';
import { useMenu } from '@/hooks/useMenu';

export interface MenuChoice<T extends string> {
  value: T;
  label: string;
  /** Printed after the label, dimmer: how many it holds. */
  count?: number;
  /** Choices in a row with the same group share a heading; a change of group
   *  draws a divider. */
  group?: string;
}

export function ChoiceMenu<T extends string>({
  value,
  choices,
  onChange,
  label,
  prefix,
  align = 'start',
}: {
  value: T;
  choices: MenuChoice<T>[];
  onChange: (value: T) => void;
  /** Names the control for a screen reader, which hears only the current choice. */
  label: string;
  /** Said dimmer before the choice ("Sort:"), where no ControlLabel is beside it. */
  prefix?: string;
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const { box, panel } = useMenu(open, setOpen);
  const current = choices.find(c => c.value === value);

  return (
    <div ref={box} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={`${label}: ${current?.label ?? ''}`}
        className={pill({ tone: open ? 'on' : 'filled', className: 'max-w-full' })}
      >
        {prefix && <span className="text-muted">{prefix}</span>}
        <span className="truncate">{current?.label}</span>
        <Chevron open={open} />
      </button>

      {open && (
        <MenuPanel ref={panel} align={align} scroll>
          {choices.map((c, i) => {
            const starts = i === 0 || choices[i - 1].group !== c.group;
            return (
              <Fragment key={c.value}>
                {starts && i > 0 && <MenuDivider />}
                {starts && c.group && <MenuLabel>{c.group}</MenuLabel>}
                <button
                  type="button"
                  aria-pressed={c.value === value}
                  onClick={() => {
                    onChange(c.value);
                    setOpen(false);
                  }}
                  className={menuItem()}
                >
                  <MenuMark kind="radio" on={c.value === value} />
                  <span className="min-w-0 flex-1 truncate">{c.label}</span>
                  {c.count !== undefined && (
                    <span className="shrink-0 tabular-nums text-muted">
                      {c.count.toLocaleString()}
                    </span>
                  )}
                </button>
              </Fragment>
            );
          })}
        </MenuPanel>
      )}
    </div>
  );
}
