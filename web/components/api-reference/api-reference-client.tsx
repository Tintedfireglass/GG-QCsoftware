"use client"

import { ApiReferenceReact } from "@scalar/api-reference-react"
// The library's compiled JS ships with its CSS import stripped (`/* empty css */`),
// so the consumer must load the stylesheet explicitly or the reference renders unstyled.
import "@scalar/api-reference-react/style.css"

/**
 * Client-side Scalar renderer. The OpenAPI document is built on the server and
 * embedded as `content`, so there is no separately-fetchable public spec URL —
 * the reference is only ever assembled inside this authenticated dashboard page.
 */
export function ApiReferenceClient({ spec }: { spec: Record<string, unknown> }) {
    return (
        <ApiReferenceReact
            configuration={{
                content: spec,
                // The dashboard already wraps this page in chrome; let Scalar own
                // only the reference panel.
                hideDarkModeToggle: false,
                hideModels: false,
            }}
        />
    )
}
