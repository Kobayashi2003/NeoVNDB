/** The VN page's data on its way to the browser, made smaller first: voice
 *  credits narrowed to this VN, and the cast's traits sent once each. */

import { forVN, packTraits } from '@/lib/characters';
import type { VN } from '@/lib/types';
import { VNView } from './VNView';

export function VNPage({ vn }: { vn: VN }) {
  const { characters, book } = packTraits(forVN(vn.characters, vn.id));
  return <VNView vn={{ ...vn, characters }} book={book} />;
}
