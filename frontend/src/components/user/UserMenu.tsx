/** The right-hand end of the header: who you are, or a way to say so.
 *
 *  The session is not known during the server render, so this draws three
 *  things, not two -- and the third is the one every page starts in. It is a
 *  box of the same size as what replaces it, so the bar does not jump a moment
 *  after it appears. */
"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ChevronDown, KeyRound, ListChecks, LogOut, MonitorSmartphone } from "lucide-react"
import { cn } from "@/lib/utils"
import { UserError } from "@/lib/user"
import { useSession } from "@/hooks/useSession"
import { useDismiss } from "@/hooks/useDismiss"
import { MenuDivider, MenuLabel, MenuPanel, menuItem } from "@/components/ui/Menu"

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
  const box = useDismiss<HTMLDivElement>(open, () => setOpen(false))

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
        // One cap at every width. When the bar runs out of room it is the
        // browse control beside this that gives way, not the name: that label
        // is a shorthand for a menu one tap away, and a name is who you are.
        className="flex max-w-36 items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-medium transition-colors hover:bg-white/20"
      >
        <span className="truncate">{session.user?.username}</span>
        <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <MenuPanel align="end">
          <MenuLabel>
            {/* The name as it was chosen: the label's capitals would change it. */}
            Signed in as{" "}
            <span className="break-all font-medium normal-case tracking-normal text-white/80">
              {session.user?.username}
            </span>
          </MenuLabel>
          <Link href="/u" onClick={() => setOpen(false)} className={menuItem()}>
            <ListChecks className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
            Your lists
          </Link>
          <Link href="/account" onClick={() => setOpen(false)} className={menuItem()}>
            <KeyRound className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
            Change password
          </Link>
          <MenuDivider />
          <button type="button" onClick={() => leave(false)} className={menuItem()}>
            <LogOut className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
            Sign out
          </button>
          <button type="button" onClick={() => leave(true)} className={menuItem()}>
            <MonitorSmartphone className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
            Sign out everywhere
          </button>
        </MenuPanel>
      )}
    </div>
  )
}
