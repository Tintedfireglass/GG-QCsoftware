import Link from "next/link"
import type { ReactNode } from "react"
import { buildWikiTree, type WikiNode } from "@/lib/wiki/wiki-fs"

function nodeHref(node: WikiNode) {
  return `/dashboard/docs/${node.slug.join("/")}`
}

function NodeTree({ node, level = 0 }: { node: WikiNode; level?: number }) {
  if (node.type === "file") {
    return (
      <li className="my-1">
        <Link className="text-sm text-slate-700 hover:text-slate-900" href={nodeHref(node)}>
          {node.name}
        </Link>
      </li>
    )
  }

  return (
    <li className="my-2">
      {level > 0 ? (
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{node.name}</div>
      ) : null}
      <ul className={level > 0 ? "pl-3" : ""}>
        {node.children.map((child) => (
          <NodeTree key={`${child.type}:${child.slug.join("/")}`} node={child} level={level + 1} />
        ))}
      </ul>
    </li>
  )
}

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
        <div className="mb-3 text-sm font-semibold text-slate-900">Docs</div>
        <ul>
          <NodeTree node={tree} />
        </ul>
      </aside>

      <section className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white p-6">
        {title ? <h1 className="mb-4 text-2xl font-semibold text-slate-900">{title}</h1> : null}
        <div className="prose prose-slate max-w-none">{children}</div>
      </section>
    </div>
  )
}

