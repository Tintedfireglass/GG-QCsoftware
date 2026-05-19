import type { ReactNode } from "react"
import { buildWikiTree } from "@/lib/wiki/wiki-fs"
import { WikiNav } from "@/components/wiki/wiki-nav"

export async function DashboardWikiLayout({
  title,
  children,
}: {
  title?: string
  children: ReactNode
}) {
  const tree = await buildWikiTree()

  return (
    <div className="flex w-full gap-6">
      <aside className="hidden w-72 shrink-0 rounded-lg border border-slate-200 bg-white p-4 lg:block">
        <WikiNav tree={tree} basePath="/dashboard/docs" />
      </aside>

      <section className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white p-6">
        {title ? <h1 className="mb-4 text-2xl font-semibold text-slate-900">{title}</h1> : null}
        <div className="wiki-prose">{children}</div>
      </section>
    </div>
  )
}
