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
        code: ({ className, children, ...props }) => (
          <code
            {...props}
            className={[
              "rounded bg-slate-100 px-1 py-0.5 text-[0.9em]",
              className ?? "",
            ].join(" ")}
          >
            {children}
          </code>
        ),
        pre: ({ children, ...props }) => (
          <pre
            {...props}
            className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-4"
          >
            {children}
          </pre>
        ),
      }}
    >
      {markdown}
    </ReactMarkdown>
  )
}

