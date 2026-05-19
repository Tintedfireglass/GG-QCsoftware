"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import type { WikiNode } from "@/lib/wiki/wiki-fs"

function nodeHref(node: WikiNode, basePath: string) {
  return `${basePath}/${node.slug.join("/")}`
}

function collectMatches(node: WikiNode, query: string, out: WikiNode[]) {
  if (!query) return
  const q = query.toLowerCase()
  if (node.type === "file" && node.name.toLowerCase().includes(q)) out.push(node)
  if (node.type === "dir") for (const child of node.children) collectMatches(child, query, out)
}

function TreeNode({
  node,
  basePath,
  depth,
}: {
  node: WikiNode
  basePath: string
  depth: number
}) {
  if (node.type === "file") {
    return (
      <li>
        <Link
          className="block rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900"
          href={nodeHref(node, basePath)}
        >
          {node.name}
        </Link>
      </li>
    )
  }

  const label = depth === 0 ? "Docs" : node.name

  return (
    <li className={depth === 0 ? "" : "mt-2"}>
      <details open={depth < 1} className="group">
        <summary className="cursor-pointer select-none rounded px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-50">
          {label}
        </summary>
        <ul className="mt-1 space-y-0.5 pl-1">
          {node.children.map((child) => (
            <TreeNode key={`${child.type}:${child.slug.join("/")}`} node={child} basePath={basePath} depth={depth + 1} />
          ))}
        </ul>
      </details>
    </li>
  )
}

export function WikiNav({ tree, basePath }: { tree: WikiNode; basePath: string }) {
  const [query, setQuery] = useState("")

  const matches = useMemo(() => {
    const out: WikiNode[] = []
    collectMatches(tree, query.trim(), out)
    return out.slice(0, 30)
  }, [tree, query])

  return (
    <div className="space-y-3">
      <div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search docs"
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand-purple)]"
        />
      </div>

      {query.trim() ? (
        <ul className="space-y-0.5">
          {matches.map((node) => (
            <li key={node.slug.join("/")}>
              <Link
                className="block rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                href={nodeHref(node, basePath)}
              >
                {node.name}
              </Link>
            </li>
          ))}
          {matches.length === 0 ? <li className="px-2 py-1 text-sm text-slate-500">No matches</li> : null}
        </ul>
      ) : (
        <ul>
          <TreeNode node={tree} basePath={basePath} depth={0} />
        </ul>
      )}
    </div>
  )
}

