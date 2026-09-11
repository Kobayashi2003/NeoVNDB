import { notFound } from "next/navigation"
import { byId } from "@/lib/api"
import { VN_PAGE } from "@/lib/fields"
import { VNPage } from "@/components/vn/VNPage"
import type { VN } from "@/lib/types"

export default async function Page({ params }: PageProps<"/v/[id]">) {
  const { id } = await params
  const vn = await byId<VN>("vn", id, VN_PAGE)
  if (!vn) notFound()
  return <VNPage vn={vn} />
}

export async function generateMetadata({ params }: PageProps<"/v/[id]">) {
  const { id } = await params
  const vn = await byId<VN>("vn", id, "title")
  return { title: vn?.title ? `${vn.title} - NeoVNDB` : "NeoVNDB" }
}
