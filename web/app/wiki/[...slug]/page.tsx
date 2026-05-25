import { redirect } from "next/navigation"

export default async function WikiDocPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  redirect(`/dashboard/docs/${slug.join("/")}`)
}
