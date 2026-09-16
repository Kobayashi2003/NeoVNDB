/** The shell the four catalogue pages share.
 *
 *  A producer, a person, a tag and a trait are all mostly a question rather
 *  than a subject: what did this company make, what did this person write,
 *  what carries this tag. So the page is a short record of the thing itself
 *  beside a listing of what it applies to, and the listing is the same one the
 *  type's own page shows -- same cards, same orders, same paging, pointed at
 *  this page's address instead.
 *
 *  Which question is being asked is a tab, and tabs are links, so the whole of
 *  the page is still in the address. They sit above the orders because
 *  choosing the question comes before choosing how to arrange the answer. */

import { one, type Params } from "@/lib/href"
import { fetchResults } from "@/lib/results"
import { DetailHeader, DetailShell } from "@/components/ui/DetailShell"
import { PrefsControls } from "@/components/ui/PrefsControls"
import { ResultsPanel } from "@/components/list/ResultsPanel"
import { Tabs, type Tab } from "@/components/list/Tabs"

export async function CatalogPage({
  title,
  subtitle,
  aside,
  action,
  tabs,
  path,
  params,
  empty,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  aside: React.ReactNode
  action?: React.ReactNode
  /** At least one. The first is the default and is left out of the address. */
  tabs: [Tab, ...Tab[]]
  path: string
  params: Params
  empty?: React.ReactNode
}) {
  const wanted = one(params, "tab")
  const active = tabs.find((t) => t.value === wanted) ?? tabs[0]
  const data = await fetchResults(active.type, params, active.filters)

  return (
    <DetailShell
      header={<DetailHeader title={title} subtitle={subtitle} action={action} />}
      aside={
        <>
          <PrefsControls className="flex-col items-stretch" />
          {aside}
        </>
      }
    >
      <Tabs path={path} params={params} tabs={tabs} active={active.value} />
      <ResultsPanel
        type={active.type}
        path={path}
        params={params}
        data={data}
        empty={empty ?? "Nothing here yet."}
      />
    </DetailShell>
  )
}
