import Link from "next/link"
import { buildWikiTree, type WikiNode } from "@/lib/wiki/wiki-fs"
import type { ReactNode } from "react"

function nodeHref(node: WikiNode) {
  if (node.type === "dir") return `/wiki/${node.slug.join("/")}`
  return `/wiki/${node.slug.join("/")}`
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
      {level > 0 && (
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{node.name}</div>
      )}
      <ul className={level > 0 ? "pl-3" : ""}>
        {node.children.map((child) => (
          <NodeTree key={`${child.type}:${child.slug.join("/")}`} node={child} level={level + 1} />
        ))}
      </ul>
    </li>
  )
}

export async function WikiLayout({
  title,
  children,
}: {
  title?: string
  children: ReactNode
}) {
  const tree = await buildWikiTree()

  return (
    <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6">
      <aside className="hidden w-72 shrink-0 rounded-lg border border-slate-200 bg-white p-4 md:block">
        <div className="mb-3 text-sm font-semibold text-slate-900">Docs</div>
        <ul>
          <NodeTree node={tree} />
        </ul>
      </aside>

      <main className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white p-6">
        {title ? <h1 className="mb-4 text-2xl font-semibold text-slate-900">{title}</h1> : null}
        <div className="prose prose-slate max-w-none">{children}</div>
      </main>
    </div>
  )
}
