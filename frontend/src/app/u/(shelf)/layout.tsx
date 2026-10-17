import { Shelf } from '@/components/user/Shelf';

/** Around every list, so moving between lists keeps the column of lists and
 *  redraws only the list beside it. */
export default function ShelfLayout({ children }: LayoutProps<'/u'>) {
  return (
    // From lg up the page is a viewport-high box whose columns scroll on their
    // own, so its own vertical padding moves into the columns.
    <main className="mx-auto flex w-full max-w-page flex-col px-4 py-6 pb-12 lg:h-[calc(100vh-var(--header-h,0px))] lg:overflow-hidden lg:py-0">
      <Shelf>{children}</Shelf>
    </main>
  );
}
