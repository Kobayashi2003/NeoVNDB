/** Behaviour for a popover menu: closes on a click outside `box` or Escape,
 *  moves between items with the arrow keys, and nudges `panel` back on screen
 *  when it would overflow. The caller keeps the open state, since some menus
 *  open through more than a toggle. */
"use client"

import { useArrowKeys } from "./useArrowKeys"
import { useDismiss } from "./useDismiss"
import { useKeptOnScreen } from "./useKeptOnScreen"

export function useMenu(open: boolean, setOpen: (open: boolean) => void) {
  const box = useDismiss<HTMLDivElement>(open, () => setOpen(false))
  const panel = useKeptOnScreen<HTMLDivElement>(open)
  useArrowKeys(open, box, panel)
  return { box, panel }
}
