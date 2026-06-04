"use client"

import { useEffect, useState } from "react"
import { getQCResult } from "@/lib/api"
import { useParams } from "next/navigation"
import { ReportLayout } from "@/components/report-layout"

export default function DedicatedReportPage() {
    const { id } = useParams()
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function load() {
            if (!id) return
            try {
                const result = await getQCResult(id as string)
                setData(result)
            } catch (error) {
                console.error(error)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [id])

    // Auto-print when data is loaded
    useEffect(() => {
        if (!loading && data) {
            setTimeout(() => {
                window.print()
            }, 800)
        }
    }, [loading, data])

    if (loading) return <div className="p-10 font-sans text-center">Loading Report...</div>
    if (!data) return <div className="p-10 font-sans text-center text-red-600">Report not found.</div>

    return (
        <div className="font-sans text-black bg-white p-8 max-w-[210mm] mx-auto min-h-screen">
            <ReportLayout data={data} />
            <style jsx global>{`
                @page {
                    size: A4;
                    margin: 0;
                }
                @media print {
                    body {
                        background: white;
                    }
                    .no-print {
                        display: none;
                    }
                }
            `}</style>
        </div>
    )
}
