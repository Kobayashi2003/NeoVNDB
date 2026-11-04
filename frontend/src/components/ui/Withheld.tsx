/** In place of an entry all-ages mode holds back: an address that names
 *  something real, which this reader is not shown. Not "nothing here", which
 *  would be untrue. */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { viewer, withheld } from '@/lib/api';
import { noticeAction } from './Notice';
import { Trouble } from './Trouble';

/** What a lookup that found nothing shows: held back by all-ages mode, or
 *  nothing there at all. Asks what the page just asked, which is not sent
 *  twice. */
export async function missing(type: string, slug: string, fields: string, path = `/${slug}`) {
  if (await withheld(type, slug, fields)) return <Withheld path={path} />;
  notFound();
}

export async function Withheld({ path }: { path: string }) {
  const { reason } = await viewer();
  const site = reason === 'site';
  return (
    <Trouble
      icon={ShieldCheck}
      title="Not shown in all-ages mode"
      action={
        !site && (
          <Link href={`/login?next=${encodeURIComponent(path)}`} className={noticeAction(true)}>
            Sign in
          </Link>
        )
      }
    >
      {site
        ? 'This entry is not for all ages, and an administrator has set this site to show only what is.'
        : 'This entry is not for all ages. Signed in, you can see it.'}
    </Trouble>
  );
}
