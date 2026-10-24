'use client';

import { useRouter } from 'next/navigation';
import { startNavigation } from '@/lib/navigating';

/** router.push and replace, with the bar along the top that a link click
 *  shows (components/layout/Navigation.tsx). */
export function useNavigate() {
  const router = useRouter();
  return {
    push(href: string) {
      startNavigation(href);
      router.push(href);
    },
    replace(href: string) {
      startNavigation(href);
      router.replace(href);
    },
  };
}
