/** The reader's 1-5 rating. Clicking the lit star clears it (no opinion is
 *  not one star). Per item rather than per list; hidden when signed out. */
"use client"

import { useEffect, useState } from "react"
import { Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { clearRating, errorText, rating as readRating, setRating } from "@/lib/user"
import { useSession } from "@/hooks/useSession"

const STARS = [1, 2, 3, 4, 5]

export function RatingStars({ id }: { id: string }) {
  const session = useSession()
  const signedIn = session.status === "in"

  const [mine, setMine] = useState<number | null>(null)
  const [hover, setHover] = useState(0)
  const [trouble, setTrouble] = useState<string | null>(null)

  useEffect(() => {
    if (!signedIn) return
    let live = true
    readRating(id).then(
      (got) => {
        if (live) setMine(got)
      },
      () => {
        // Not worth saying anything for: the stars simply start empty, and
        // trying to set one will say so out loud if it is still broken.
      },
    )
    return () => {
      live = false
    }
  }, [signedIn, id])

  if (!signedIn) return null

  async function choose(star: number) {
    const before = mine
    const next = star === mine ? null : star
    // Moved first: a star that waits for a round trip before lighting reads as
    // one that did not register the click.
    setMine(next)
    setTrouble(null)
    try {
      if (next === null) await clearRating(id)
      else await setRating(id, next)
    } catch (err) {
      setMine(before)
      setTrouble(errorText(err))
    }
  }

  const lit = hover || mine || 0

  return (
    <div className="flex items-center">
      <div className="flex items-center" onMouseLeave={() => setHover(0)}>
        {STARS.map((star) => (
          <button
            key={star}
            type="button"
            onMouseEnter={() => setHover(star)}
            onClick={() => choose(star)}
            aria-label={star === mine ? "Clear your rating" : `Rate ${star} of 5`}
            aria-pressed={mine !== null && star <= mine}
            className="rounded p-0.5 transition-colors"
          >
            <Star
              className={cn(
                "h-4 w-4 transition-colors",
                star <= lit ? "fill-yellow-400 text-yellow-400" : "fill-transparent text-white/30",
              )}
              aria-hidden
            />
          </button>
        ))}
      </div>
      {trouble && (
        <span role="alert" className="ml-2 text-xs text-red-400">
          {trouble}
        </span>
      )}
    </div>
  )
}
