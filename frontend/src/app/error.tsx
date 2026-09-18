/** Something broke while drawing a page.
 *
 *  Which mostly means the read API did not answer: this mirror is four
 *  processes behind one address, and a page is the thing that notices when one
 *  of them is not running. So the first thing offered is to try again, because
 *  more often than not that works. */
"use client"

import { useEffect } from "react"
import { Trouble } from "@/components/ui/Trouble"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // The server keeps the detail and hands the browser only a digest; this
    // puts the two ends of that in the same place for whoever is debugging.
    console.error("page failed", error)
  }, [error])

  return (
    <Trouble
      title="That did not work"
      action={
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/20"
        >
          Try again
        </button>
      }
    >
      The page could not be drawn. If this keeps happening, the read API is
      probably not answering.
      {error.digest && <span className="mt-2 block font-mono text-xs text-muted/60">{error.digest}</span>}
    </Trouble>
  )
}
