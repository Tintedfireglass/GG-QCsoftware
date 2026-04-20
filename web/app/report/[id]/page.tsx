"use client"

import { useEffect, useState } from "react"
import { getQCResult } from "@/lib/api"
import { useParams } from "next/navigation"
import { gradeHeroColor, gradeLabel, getGradeStyle } from "@/lib/grades"
import { QRCodeSVG } from "qrcode.react"
import { formatAppVersion, formatBytes, formatDbDateTime, formatWindowsVersion } from "@/lib/utils"

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

    const { test_results = [] } = data
    const batteryBrand = data?.battery_details_json
        ? (data.battery_details_json.manufactureName || data.battery_details_json.name || data.battery_details_json.partNumber)
        : null
    const hasCycleCount = data?.battery_details_json?.cycleCount != null && data.battery_details_json.cycleCount > 0
    const storageVolumes = Array.isArray(data?.storage_details_json?.volumes)
        ? data.storage_details_json.volumes
        : []
    const storageTotalBytes = storageVolumes.reduce(
        (sum: number, vol: any) => sum + (typeof vol?.totalBytes === "number" ? vol.totalBytes : 0),
        0
    )
    const storageTotalLabel =
        storageTotalBytes > 0
            ? formatBytes(storageTotalBytes)
            : (data?.storage_details_json?.totalCapacityGB
                ? `${data.storage_details_json.totalCapacityGB?.toFixed(0)} GB`
                : "Storage details not available")
    const activationStatus = data?.system_info_json?.windowsActivationStatus
    const isActivated = data?.system_info_json?.isWindowsActivated
    const activationText =
        typeof isActivated === "boolean"
            ? `${isActivated ? "Activated" : "Not Activated"}${activationStatus ? ` (${activationStatus})` : ""}`
            : (activationStatus || "Unknown")
    const antivirusStatus = data?.system_info_json?.antivirusStatus
    const isAntivirusHealthy = data?.system_info_json?.isAntivirusHealthy
    const antivirusText =
        typeof isAntivirusHealthy === "boolean"
            ? `${isAntivirusHealthy ? "Healthy" : "Not Healthy"}${antivirusStatus ? ` (${antivirusStatus})` : ""}`
            : (antivirusStatus || "Unknown")

    return (
        <div className="font-sans text-black bg-white p-8 max-w-[210mm] mx-auto min-h-screen">
            {/* Header */}
            <header className="border-b-2 border-black pb-4 mb-6 flex justify-between items-end">
                <div>
                    <h1 className="text-4xl font-bold uppercase tracking-wide">QC Certificate</h1>
                    <p className="text-sm mt-1 text-gray-600">Quality Control Report</p>
                </div>
                <div className="text-right">
                    <div className="text-lg font-bold">Test ID: #{data.id}</div>
                    <div className="text-sm text-gray-600">{formatDbDateTime(data.timestamp)}</div>
                </div>
            </header>

            {/* Overall Status */}
            <div className="mb-8 flex items-center justify-between bg-gray-50 p-6 border border-gray-200 rounded-sm">
                <div>
                    <div className="text-sm uppercase tracking-wider text-gray-500 font-semibold">PRAMAAN Health Score</div>
                    {data.pramaan_grade ? (
                        <>
                            <div className={`text-5xl font-bold mt-2 ${gradeHeroColor(data.pramaan_grade)}`}>
                                {data.pramaan_grade}
                            </div>
                            <div className="text-sm text-gray-600 mt-1">{gradeLabel(data.pramaan_grade)} — {data.pramaan_score}/100</div>
                        </>
                    ) : (
                        <div className={`text-5xl font-bold mt-2 ${data.overall_pass ? 'text-green-700' : 'text-red-700'}`}>
                            {data.overall_pass ? 'PASSED' : 'FAILED'}
                        </div>
                    )}
                </div>
                <div className="text-right flex items-center gap-6">
                    <div>
                        <div className="text-sm uppercase tracking-wider text-gray-500 font-semibold mb-1">Device ID</div>
                        <div className="font-mono text-xl">{data.machine_id}</div>
                    </div>
                    {data.health_id && (
                        <div className="text-right">
                            <div className="text-sm uppercase tracking-wider text-gray-500 font-semibold mb-1">Health ID</div>
                            <div className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">{data.health_id}</div>
                        </div>
                    )}
                    {data.health_id && (
                        <div className="bg-white p-2 rounded shadow-sm border border-gray-100 flex flex-col items-center">
                            <QRCodeSVG
                                value={`https://pramaan-dashboard.gadgetguruz.com/verify/${data.health_id}`}
                                size={80}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* System Info Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-6 mb-8">
                <div>
                    <h3 className="uppercase tracking-widest text-xs font-bold border-b border-gray-300 pb-2 mb-3">System Specification</h3>
                    <table className="w-full text-sm">
                        <tbody>
                            <tr className="border-b border-dotted border-gray-300">
                                <td className="py-2 text-gray-600 w-1/3">Manufacturer</td>
                                <td className="py-2 font-medium">{data.system_manufacturer}</td>
                            </tr>
                            {data.computer_name && (
                                <tr className="border-b border-dotted border-gray-300">
                                    <td className="py-2 text-gray-600">Computer Name</td>
                                    <td className="py-2 font-mono font-medium">{data.computer_name}</td>
                                </tr>
                            )}
                            <tr className="border-b border-dotted border-gray-300">
                                <td className="py-2 text-gray-600">Model</td>
                                <td className="py-2 font-medium">{data.system_model}</td>
                            </tr>
                            <tr className="border-b border-dotted border-gray-300">
                                <td className="py-2 text-gray-600">Serial No.</td>
                                <td className="py-2 font-mono">{data.system_serial}</td>
                            </tr>
                            <tr className="border-b border-dotted border-gray-300">
                                <td className="py-2 text-gray-600">MAC Address</td>
                                <td className="py-2 font-mono">{data.mac_address}</td>
                            </tr>
                            <tr className="border-b border-dotted border-gray-300">
                                <td className="py-2 text-gray-600">Windows Version</td>
                                <td className="py-2 font-medium">{formatWindowsVersion(data.system_info_json?.osVersion, data.system_info_json?.windowsProductName)}</td>
                            </tr>
                            <tr className="border-b border-dotted border-gray-300">
                                <td className="py-2 text-gray-600">Windows Activation</td>
                                <td className="py-2 font-medium">{activationText}</td>
                            </tr>
                            <tr className="border-b border-dotted border-gray-300">
                                <td className="py-2 text-gray-600">Antivirus Status</td>
                                <td className="py-2 font-medium">{antivirusText}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div>
                    <h3 className="uppercase tracking-widest text-xs font-bold border-b border-gray-300 pb-2 mb-3">Hardware Details</h3>
                    <table className="w-full text-sm">
                        <tbody>
                            <tr className="border-b border-dotted border-gray-300">
                                <td className="py-2 text-gray-600 w-1/3">Processor</td>
                                <td className="py-2 font-medium">{data.cpu_model}</td>
                            </tr>
                            <tr className="border-b border-dotted border-gray-300">
                                <td className="py-2 text-gray-600">RAM</td>
                                <td className="py-2 font-medium">
                                    {data.ram_total ? Math.round(data.ram_total / (1024 * 1024 * 1024)) : 0} GB
                                </td>
                            </tr>
                            {data.storage_details_json && (
                                <tr className="border-b border-dotted border-gray-300">
                                    <td className="py-2 text-gray-600">Storage</td>
                                    <td className="py-2 font-medium">
                                        {storageTotalLabel}
                                    </td>
                                </tr>
                            )}
                                {data.battery_details_json && (
                                    <tr className="border-b border-dotted border-gray-300">
                                        <td className="py-2 text-gray-600">Battery</td>
                                        <td className="py-2 font-medium">
                                        {data.battery_details_json.isTampered
                                            ? 'Battery Tampered - Unable to read data'
                                            : `Wear: ${data.battery_details_json.wearLevelPercent}%`}
                                    </td>
                                </tr>
                            )}
                            {data.battery_details_json && !data.battery_details_json.isTampered && batteryBrand && (
                                <tr className="border-b border-dotted border-gray-300">
                                    <td className="py-2 text-gray-600">Battery Brand</td>
                                    <td className="py-2 font-medium">{batteryBrand}</td>
                                </tr>
                            )}
                            {data.battery_details_json && !data.battery_details_json.isTampered && !hasCycleCount && (
                                <tr className="border-b border-dotted border-gray-300">
                                    <td className="py-2 text-gray-600">Cycle Count</td>
                                    <td className="py-2 text-gray-500 italic">Not reported by firmware</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Test Results Table */}
            <div className="mb-8 overflow-x-auto w-full">
                <h3 className="uppercase tracking-widest text-xs font-bold border-b-2 border-black pb-2 mb-4">Diagnostic Results</h3>
                <table className="w-full text-sm text-left">
                    <thead>
                        <tr className="bg-gray-100 border-b border-gray-300">
                            <th className="py-2 px-3 font-semibold w-1/4">Test Component</th>
                            <th className="py-2 px-3 font-semibold w-[80px] text-center">Grade</th>
                            <th className="py-2 px-3 font-semibold w-[80px] text-center">Score</th>
                            <th className="py-2 px-3 font-semibold">Notes / Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        {test_results.map((test: any, i: number) => {
                            const s = getGradeStyle(test.grade);
                            return (
                                <tr key={test.id} className="border-b border-gray-200">
                                    <td className="py-3 px-3 font-medium">{test.test_type}</td>
                                    <td className="py-3 px-3 text-center">
                                        {test.grade ? (
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${s.bg} ${s.text}`}>
                                                {test.grade}
                                            </span>
                                        ) : (
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${test.passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                {test.passed ? 'PASS' : 'FAIL'}
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-3 px-3 text-center font-medium">{test.score ?? '—'}</td>
                                    <td className="py-3 px-3 text-gray-600">
                                        <div className="mb-1">{test.message}</div>
                                        {test.details_json && Array.isArray(test.details_json) && (
                                            <div className="text-xs text-slate-500">
                                                {test.details_json.join(', ')}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Technician Notes */}
            {data.technician_notes && (
                <div className="mb-8 border border-gray-300 p-4 rounded bg-gray-50 break-inside-avoid">
                    <h3 className="font-bold text-xs uppercase text-gray-500 mb-2">Technician Notes</h3>
                    <p className="text-sm italic">{data.technician_notes}</p>
                </div>
            )}

            {/* Footer */}
            <footer className="mt-12 pt-6 border-t border-gray-300 text-center text-xs text-gray-500 flex justify-between">
                <div>Generated by pramaan</div>
                <div>App Version: {formatAppVersion(data.app_version)}</div>
                <div>Test ID: #{data.id}</div>
                <div>Submission IP: {data.submission_ip || "N/A"}</div>
                <div>Date Printed: {new Date().toLocaleDateString()}</div>
            </footer>

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
