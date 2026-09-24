/** The shape of a page that has nothing to show but a reason.
 *
 *  Not found and gone wrong are the same page with different words, so they
 *  are the same component: a heading, a sentence a reader can act on, and a
 *  way out that is never the back button. */
import Link from "next/link"

export function Trouble({
  title,
  children,
  action,
}: {
  title: string
  children: React.ReactNode
  /** Offered before the links home, where there is something to try. */
  action?: React.ReactNode
}) {
  return (
    <main className="mx-auto flex w-full max-w-page flex-col px-4 py-16 animate-slide-up-fade">
      <div className="w-full max-w-lg rounded-xl border border-white/10 bg-surface p-6">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted">{children}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          {action}
          <Link href="/" className="text-accent transition-colors hover:underline coarse:py-1">
            Front page
          </Link>
          <Link href="/v" className="text-muted transition-colors hover:text-white">
            Browse visual novels
          </Link>
        </div>
      </div>
    </main>
  )
}
