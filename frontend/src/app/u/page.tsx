import type { Metadata } from "next"
import { CollectionsPanel } from "@/components/user/CollectionsPanel"

export const metadata: Metadata = { title: "Your lists - NeoVNDB" }

export default function CollectionsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col px-4 py-6 pb-12 animate-slide-up-fade">
      <h1 className="mb-4 text-xl font-bold sm:text-2xl">Your lists</h1>
      <CollectionsPanel />
    </main>
  )
}
