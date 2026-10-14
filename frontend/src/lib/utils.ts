import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names and lets a later Tailwind class win over an earlier one
 *  of the same kind, so a caller can override what a component sets. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
