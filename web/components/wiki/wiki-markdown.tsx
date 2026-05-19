import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

export function WikiMarkdown({ markdown }: { markdown: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: (props) => (
          <a
            {...props}
            className="text-[var(--brand-purple)] underline underline-offset-2 hover:opacity-90"
            target={props.href?.startsWith("http") ? "_blank" : undefined}
            rel={props.href?.startsWith("http") ? "noreferrer" : undefined}
          />
        ),
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
