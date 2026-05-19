import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import path from "node:path"

function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href) || /^mailto:/i.test(href)
}

function splitHref(href: string) {
  const hashIndex = href.indexOf("#")
  if (hashIndex === -1) return { pathPart: href, hashPart: "" }
  return { pathPart: href.slice(0, hashIndex), hashPart: href.slice(hashIndex) }
}

function toWikiHref({
  href,
  basePath,
  currentSlug,
}: {
  href: string
  basePath: string
  currentSlug: string[]
}) {
  if (!href) return href
  if (href.startsWith("#")) return href
  if (href.startsWith("/")) return href
  if (isExternalHref(href)) return href

  const { pathPart, hashPart } = splitHref(href)
  const decodedPath = decodeURI(pathPart)

  const currentDir = currentSlug.slice(0, Math.max(0, currentSlug.length - 1))
  const joined = path.posix.normalize(path.posix.join(...currentDir, decodedPath))

  const trimmed = joined.replace(/^(\.\/)+/, "").replace(/^\/+/, "")
  const withoutDocsPrefix = trimmed.replace(/^docs\//i, "")
  const withoutExt = withoutDocsPrefix.replace(/\.md$/i, "")

  const segments = withoutExt.split("/").filter(Boolean)
  if (!segments.length) return href

  return `${basePath}/${segments.map(encodeURIComponent).join("/")}${hashPart}`
}

export function WikiMarkdown({
  markdown,
  basePath,
  currentSlug,
}: {
  markdown: string
  basePath: string
  currentSlug: string[]
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: (props) => {
          const href = typeof props.href === "string" ? props.href : ""
          const mapped = toWikiHref({ href, basePath, currentSlug })
          const external = !!mapped && isExternalHref(mapped)

          return (
            <a
              {...props}
              href={mapped}
              className="text-[var(--brand-purple)] underline underline-offset-2 hover:opacity-90"
              target={external ? "_blank" : undefined}
              rel={external ? "noreferrer" : undefined}
            />
          )
        },
        code: ({ className, children, ...props }: any) => {
          const isBlock = typeof className === "string" && className.includes("language-")
          if (isBlock) {
            return (
              <code {...props} className={["block text-sm", className ?? ""].join(" ")}>
                {children}
              </code>
            )
          }
          return (
            <code {...props} className={className}>
              {children}
            </code>
          )
        },
        pre: ({ children, ...props }) => (
          <pre {...props}>
            {children}
          </pre>
        ),
        table: ({ children, ...props }) => (
          <div className="my-4 overflow-x-auto">
            <table {...props}>{children}</table>
          </div>
        ),
      }}
    >
      {markdown}
    </ReactMarkdown>
  )
}
