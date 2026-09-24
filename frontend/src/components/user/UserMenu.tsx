/** The header's account control. The session is unknown during the server
 *  render, so a same-size placeholder is drawn first to avoid a jump. */
"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ChevronDown, KeyRound, ListChecks, LogOut, MonitorSmartphone } from "lucide-react"
import { cn } from "@/lib/utils"
import { UserError } from "@/lib/user"
import { useSession } from "@/hooks/useSession"
import { useMenu } from "@/hooks/useMenu"
import { MenuDivider, MenuLabel, MenuPanel, menuItem } from "@/components/ui/Menu"

export function UserMenu() {
  const session = useSession()

  if (session.status === "unknown") {
    return <span className="h-6 w-16 shrink-0 animate-pulse rounded-full bg-white/5" aria-hidden />
  }
  if (session.status === "out") return <SignInLink />
  return <SignedIn />
}

/** The sign-in link returns to the current address. Read at click time:
 *  reading it during render needs useSearchParams, which opts the page out of
 *  static rendering. */
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
  const { box } = useMenu(open, setOpen)

  async function leave(everywhere: boolean) {
    setOpen(false)
    try {
      await (everywhere ? session.signOutEverywhere() : session.signOut())
    } catch (err) {
      // A 401 means the session is already gone. Any other failure keeps the
      // signed-in bar, since the cookie is still live.
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
        <ChevronDown className={cn("icon-text h-3 w-3 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
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
            <ListChecks className="icon-text h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
            Your lists
          </Link>
          <Link href="/account" onClick={() => setOpen(false)} className={menuItem()}>
            <KeyRound className="icon-text h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
            Change password
          </Link>
          <MenuDivider />
          <button type="button" onClick={() => leave(false)} className={menuItem()}>
            <LogOut className="icon-text h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
            Sign out
          </button>
          <button type="button" onClick={() => leave(true)} className={menuItem()}>
            <MonitorSmartphone className="icon-text h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
            Sign out everywhere
          </button>
        </MenuPanel>
      )}
    </div>
  )
}
