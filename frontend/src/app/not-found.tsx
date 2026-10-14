/** Nothing here. Reached by an address that matches no page, and by any page
 *  that looked something up and did not find it. */
import type { Metadata } from 'next';
import { Trouble } from '@/components/ui/Trouble';

export const metadata: Metadata = { title: 'Not found - NeoVNDB' };

export default function NotFound() {
  return (
    <Trouble title="Nothing here">
      That address does not name anything in this mirror. An id that vndb has since hidden or merged
      will land here too.
    </Trouble>
  );
}
