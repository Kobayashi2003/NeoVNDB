/** Mutually exclusive options in one pill, for scales where every step
 *  should be visible. Options can set their own active colour. */
'use client';

import { cn } from '@/lib/utils';
import { rowKeys } from '@/hooks/rowKeys';

export interface Option<T extends string> {
  value: T;
  label: string;
  /** Shown below sm, where the full label will not fit. */
  short?: string;
  /** Active-state classes; the neutral fill is used when absent. */
  activeClass?: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  /** Names the group for a screen reader, which cannot read the colours. */
  label: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={rowKeys({ choose: true })}
      className={cn(
        'flex items-center overflow-hidden rounded-full border border-white/10',
        className,
      )}
    >
      {options.map(option => (
        <button
          key={option.value}
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'flex-1 whitespace-nowrap px-2.5 py-1.5 text-center text-xs font-medium transition-colors',
            value === option.value
              ? (option.activeClass ?? 'bg-white/20 text-white')
              : 'text-muted hover:bg-white/10 hover:text-white',
          )}
        >
          {option.short ? (
            <>
              <span className="sm:hidden">{option.short}</span>
              <span className="hidden sm:inline">{option.label}</span>
            </>
          ) : (
            option.label
          )}
        </button>
      ))}
    </div>
  );
}
