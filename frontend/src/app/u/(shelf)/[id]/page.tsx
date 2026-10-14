import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { CollectionPanel } from '@/components/user/CollectionPanel';

export const metadata: Metadata = { title: 'A list - NeoVNDB' };

export default async function CollectionPage({ params, searchParams }: PageProps<'/u/[id]'>) {
  const { id } = await params;
  const query = await searchParams;

  // The name cannot be in the title: who a list belongs to is not known until
  // the page is in a browser, so the server has nothing to put there.
  const list = Number(id);
  if (!Number.isInteger(list) || list < 1) notFound();

  const raw = query.page;
  const page = Math.max(1, Number(Array.isArray(raw) ? raw[0] : raw) || 1);

  // Not keyed: changing the page, order or list redraws the items, while the
  // heading and controls stay and the old items wait, dimmed, for the new.
  return <CollectionPanel id={list} page={page} params={query} />;
}
