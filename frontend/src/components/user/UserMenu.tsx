/** The right-hand end of the header: who you are, or a way to say so.
 *
 *  The session is not known during the server render, so this draws three
 *  things, not two -- and the third is the one every page starts in. It is a
 *  box of the same size as what replaces it, so the bar does not jump a moment
 *  after it appears. */
"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ChevronDown, KeyRound, LogOut, MonitorSmartphone } from "lucide-react"
import { cn } from "@/lib/utils"
import { UserError } from "@/lib/user"
import { useSession } from "@/hooks/useSession"

export function UserMenu() {
  const session = useSession()

  if (session.status === "unknown") {
    return <span className="h-6 w-16 shrink-0 animate-pulse rounded-full bg-white/5" aria-hidden />
  }
  if (session.status === "out") return <SignInLink />
  return <SignedIn />
}

/** Signing in from halfway through a narrowed listing should come back to it,
 *  and what the reader narrowed by is in the address. Reading that address
 *  during the render would mean either a hydration mismatch or
 *  `useSearchParams`, which opts the whole page out of static rendering -- so
 *  it is read at the moment of the click instead, and the plain `/login` the
 *  markup carries is what a new tab gets. */
function SignInLink() {
  const router = useRouter()

  return (
    <Link
      href="/login"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        router.push(`/login?next=${encodeURIComponent(location.pathname + location.search)}`)
      }}
      className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-medium transition-colors hover:bg-white/20"
    >
      Sign in
    </Link>
  )
}

function SignedIn() {
  const session = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", escape)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", escape)
    }
  }, [open])

  async function leave(everywhere: boolean) {
    setOpen(false)
    try {
      await (everywhere ? session.signOutEverywhere() : session.signOut())
    } catch (err) {
      // A 401 says the session was already gone, which is where this was
      // headed anyway. Anything else leaves it standing: drawing a signed-out
      // bar over a browser that still carries a live cookie is a lie the next
      // reload would correct, and the reader would not know which to believe.
      if (!(err instanceof UserError && err.status === 401)) return
      session.forget()
    }
    // Every other page is still worth reading signed out. This one is about
    // an account the reader no longer has here.
    if (pathname === "/account") router.push("/")
  }

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex max-w-36 items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-medium transition-colors hover:bg-white/20"
      >
        <span className="truncate">{session.user?.username}</span>
        <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-52 rounded-lg border border-white/10 bg-[var(--overlay)] p-1 shadow-xl">
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/10"
          >
            <KeyRound className="h-3 w-3 shrink-0" aria-hidden />
            Change password
          </Link>
          <button
            type="button"
            onClick={() => leave(false)}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/10"
          >
            <LogOut className="h-3 w-3 shrink-0" aria-hidden />
            Sign out
          </button>
          <button
            type="button"
            onClick={() => leave(true)}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/10"
          >
            <MonitorSmartphone className="h-3 w-3 shrink-0" aria-hidden />
            Sign out everywhere
          </button>
        </div>
      )}
    </div>
  )
}
