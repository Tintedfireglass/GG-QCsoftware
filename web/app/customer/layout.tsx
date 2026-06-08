import { AnalyticsTracker } from "@/components/analytics-tracker"

// Wraps all storefront (/customer/*) pages so visitor analytics is tracked
// everywhere a customer browses, without touching the admin dashboard.
export default function CustomerLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            {children}
            <AnalyticsTracker />
        </>
    )
}
