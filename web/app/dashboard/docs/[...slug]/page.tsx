import { notFound } from "next/navigation"
import path from "node:path"
import { DashboardWikiLayout } from "@/components/wiki/dashboard-wiki-layout"
import { WikiMarkdown } from "@/components/wiki/wiki-markdown"
import { readWikiMarkdown, resolveWikiMarkdown } from "@/lib/wiki/wiki-fs"

export default async function DashboardDocPage({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  const resolved = await resolveWikiMarkdown(slug)
  if (!resolved) notFound()

  const markdown = await readWikiMarkdown(resolved)
  const title = path.basename(resolved).toLowerCase() === "readme.md" ? slug[slug.length - 1] : slug[slug.length - 1]

  return (
    <DashboardWikiLayout title={title}>
      <WikiMarkdown markdown={markdown} />
    </DashboardWikiLayout>
  )
}

