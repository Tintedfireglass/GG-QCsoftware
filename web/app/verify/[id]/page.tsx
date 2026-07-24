"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { formatAppVersion, formatDateTimeDMY } from "@/lib/utils"
import { getPublicVerify } from "@/lib/api"
import { useBranding } from "@/components/branding-provider"

export default function VerificationPage() {
    const branding = useBranding()
    const { id } = useParams()
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        async function load() {
            if (!id) return
            try {
                const result = await getPublicVerify(String(id))
                setData(result)
            } catch (err) {
                console.error(err)
                setError(err instanceof Error ? err.message : "An error occurred during verification.")
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [id])

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="p-10 font-sans text-center text-gray-600">Verifying {branding.siteName} Certificate...</div>
            </div>
        );
    }

    if (error || !data || !data.verified) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
                <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center border-t-4 border-red-500">
                    <div className="text-red-500 text-5xl mb-4">⚠️</div>
                    <h1 className="text-2xl font-bold text-gray-800 mb-2">Verification Failed</h1>
                    <p className="text-gray-600 mb-6">{error || "This certificate could not be verified or does not exist."}</p>
                    <div className="text-sm text-gray-500 bg-gray-100 p-3 rounded text-left break-all">
                        <strong>Health ID:</strong> {id}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
            <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-md overflow-hidden border border-gray-200">

                {/* Header Banner */}
                <div className="bg-slate-900 px-6 py-8 text-center text-white border-b-4 border-emerald-500">
                    <h1 className="text-3xl font-bold tracking-tight uppercase">
                        Verified Authentic
                    </h1>
                    <p className="mt-2 text-slate-300 font-medium tracking-wide">
                        {branding.siteName} Device Certification
                    </p>
                </div>

                {/* Score Section */}
                <div className="px-8 py-10 text-center border-b border-gray-100">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">{branding.siteName} Health Score</p>
                    <div className="flex justify-center items-end space-x-4">
                        <div className={`text-7xl font-black tracking-tighter ${data.grade === 'A+' ? 'text-green-600' :
                            data.grade === 'A' ? 'text-green-500' :
                                data.grade === 'B' ? 'text-yellow-500' :
                                    data.grade === 'C' ? 'text-orange-500' :
                                        'text-red-600'
                            }`}>
                            {data.grade || "N/A"}
                        </div>
                        <div className="text-4xl font-bold text-gray-800 mb-1">
                            {data.score !== null && data.score !== undefined ? data.score : "N/A"}
                            <span className="text-2xl text-gray-400 font-normal">/100</span>
                        </div>
                    </div>
                    <div className="mt-4 inline-block px-4 py-1 rounded-full bg-gray-100 text-gray-700 font-semibold text-sm">
                        {data.gradeLabel || "Unknown"}
                    </div>
                </div>

                {/* Details Grid */}
                <div className="px-8 py-8 bg-gray-50 grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                        <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Machine Verification</p>
                        <p className="font-semibold text-gray-900">{data.device?.manufacturer} {data.device?.model || "Unknown"}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Status</p>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                            Active & Valid
                        </span>
                    </div>
                    <div className="sm:col-span-2">
                        <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Date Issued</p>
                        <p className="text-gray-900">{formatDateTimeDMY(data.certificationDate)}</p>
                    </div>
                    <div className="sm:col-span-2">
                        <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">App Version</p>
                        <p className="text-gray-900">{formatAppVersion(data.appVersion)}</p>
                    </div>
                    <div className="sm:col-span-2">
                        <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Health ID (UUID)</p>
                        <p className="text-sm font-mono text-gray-600 bg-gray-50 border border-gray-200 p-3 rounded break-all tracking-tight">
                            {data.healthId}
                        </p>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-gray-200 text-center bg-gray-100 text-xs text-gray-500">
                    <p>Powered by {branding.siteName} v{formatAppVersion(data.appVersion)}</p>
                    <p className="mt-1">This digital certificate guarantees that the device hardware was scanned and verified by {branding.siteName} scoring algorithms.</p>
                </div>
            </div>
        </div>
    )
}
