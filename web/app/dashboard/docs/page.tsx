import Link from "next/link"
import { DashboardWikiLayout } from "@/components/wiki/dashboard-wiki-layout"
import { buildWikiTree, type WikiNode } from "@/lib/wiki/wiki-fs"

function flattenFiles(node: WikiNode, out: WikiNode[] = []) {
  if (node.type === "file") {
    out.push(node)
    return out
  }
  for (const child of node.children) flattenFiles(child, out)
  return out
}

export default async function DashboardDocsIndexPage() {
  const tree = await buildWikiTree()
  const files = flattenFiles(tree).slice(0, 50)

  return (
    <DashboardWikiLayout title="Docs">
      <p>Open a page from the menu.</p>
      <h2>Recent pages</h2>
      <ul>
        {files.map((node) => (
          <li key={node.slug.join("/")}>
            <Link href={`/dashboard/docs/${node.slug.join("/")}`}>{node.name}</Link>
          </li>
        ))}
      </ul>
    </DashboardWikiLayout>
  )
}

