import { ApiReferenceClient } from '@/components/api-reference/api-reference-client'
import { buildPartnerOpenApiDocument } from '@/lib/openapi/document'
import { getBranding } from '@/lib/shared/services/branding.service'

export async function generateMetadata() {
    const { siteName } = await getBranding()
    return {
        title: `${siteName} Partner API`,
        description: `Integrate ${siteName} QC data and license management into your own systems.`,
    }
}

/**
 * Public partner API reference.
 *
 * Unauthenticated and outside /dashboard: resellers hand this URL to their own
 * developers. It renders the partner-only spec, so nothing about the internal
 * dashboard API is exposed here.
 */
export default async function PartnerApiDocsPage() {
    const { siteName } = await getBranding()
    return <ApiReferenceClient spec={buildPartnerOpenApiDocument(siteName)} />
}
