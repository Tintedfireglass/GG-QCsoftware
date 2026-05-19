import fs from "node:fs/promises"
import path from "node:path"

export type WikiNode =
  | {
      type: "dir"
      name: string
      slug: string[]
      children: WikiNode[]
    }
  | {
      type: "file"
      name: string
      slug: string[]
      sourcePath: string
    }

const docsRoot = path.resolve(process.cwd(), "..", "docs", "end-user")

function slugToFsPath(slug: string[]): string {
  const target = path.resolve(docsRoot, ...slug)
  if (!target.startsWith(docsRoot + path.sep) && target !== docsRoot) {
    throw new Error("Invalid wiki path")
  }
  return target
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

export async function resolveWikiMarkdown(slug: string[]) {
  const base = slugToFsPath(slug)

  const directMd = `${base}.md`
  if (await pathExists(directMd)) return directMd

  const readmeMd = path.join(base, "README.md")
  if (await pathExists(readmeMd)) return readmeMd

  return null
}

function labelFromFilename(filename: string) {
  const base = filename.replace(/\.md$/i, "")
  if (base.toLowerCase() === "readme") return "README"
  return base.replace(/[-_]/g, " ")
}

export async function buildWikiTree(): Promise<WikiNode> {
  async function walk(currentFsPath: string, slug: string[]): Promise<WikiNode> {
    const entries = await fs.readdir(currentFsPath, { withFileTypes: true })
    const children: WikiNode[] = []
    const readmeFullPath = path.join(currentFsPath, "README.md")
    const hasReadme = await pathExists(readmeFullPath)

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue
      const entryFsPath = path.join(currentFsPath, entry.name)

      if (entry.isDirectory()) {
        const child = await walk(entryFsPath, [...slug, entry.name])
        children.push(child)
        continue
      }

      if (!entry.isFile()) continue
      if (!entry.name.toLowerCase().endsWith(".md")) continue
      if (hasReadme && entry.name.toLowerCase() === "readme.md") continue

      const slugWithoutExt = [...slug, entry.name.replace(/\.md$/i, "")]
      children.push({
        type: "file",
        name: labelFromFilename(entry.name),
        slug: slugWithoutExt,
        sourcePath: entryFsPath,
      })
    }

    children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    const name = slug.length ? slug[slug.length - 1] : "end-user"
    if (hasReadme) {
      children.unshift({
        type: "file",
        name,
        slug: [...slug, "README"],
        sourcePath: readmeFullPath,
      })
    }

    return { type: "dir", name, slug, children }
  }

  return walk(docsRoot, [])
}

export async function readWikiMarkdown(absPath: string) {
  const resolved = path.resolve(absPath)
  if (!resolved.startsWith(docsRoot + path.sep)) {
    throw new Error("Invalid wiki file path")
  }
  return fs.readFile(resolved, "utf8")
}
