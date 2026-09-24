/** Month names and stepping. A plain module because both the server-rendered
 *  front page and the client-side picker call it. */

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
