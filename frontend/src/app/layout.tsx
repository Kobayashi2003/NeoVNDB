import type { Metadata } from "next"
import "./globals.css"
import { Header } from "@/components/layout/Header"

export const metadata: Metadata = {
  title: "NeoVNDB",
  description: "A local mirror of the VNDB database.",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <Header />
        {children}
      </body>
    </html>
  )
}
