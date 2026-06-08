"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackPageview } from "@/lib/analytics";

/** Fires a pageview on mount and on every client-side route change. Mount once
 *  in the root layout. Renders nothing. */
export default function AnalyticsTracker() {
    const pathname = usePathname();
    useEffect(() => {
        trackPageview();
    }, [pathname]);
    return null;
}
