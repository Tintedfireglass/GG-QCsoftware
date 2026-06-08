import { ApiReferenceClient } from "@/components/api-reference/api-reference-client"
import { buildOpenApiDocument } from "@/lib/openapi/document"

export const metadata = {
    title: "API Reference",
}

// The spec is static metadata about the API surface; build it once per request
// on the server and hand it to Scalar as embedded content (no public spec URL).
export default function ApiReferencePage() {
    const spec = buildOpenApiDocument()

    return (
        // Pull out of the dashboard's default padding so Scalar can use the full
        // width; -m-4 / -m-8 cancels the <main> padding from the dashboard layout.
        <div className="-m-4 md:-m-8">
            <ApiReferenceClient spec={spec} />
        </div>
    )
}
