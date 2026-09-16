/** Month names, and the arithmetic of stepping between months.
 *
 *  Its own module because both sides want it: the front page names the month
 *  it is showing while rendering on the server, and the picker names the same
 *  months in the browser. A `"use client"` module cannot be called from the
 *  server at all -- only rendered -- so the shared part lives out here. */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

export function monthName(month: number): string {
  return MONTHS[month - 1] ?? ""
}

export function monthNames(): readonly string[] {
  return MONTHS
}

/** The month a step away, rolling the year over at either end. */
export function stepMonth(year: number, month: number, by: number): { year: number; month: number } {
  const n = year * 12 + (month - 1) + by
  return { year: Math.floor(n / 12), month: (n % 12) + 1 }
}
