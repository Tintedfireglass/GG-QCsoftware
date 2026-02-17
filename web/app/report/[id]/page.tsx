"use client"

import { useEffect, useState } from "react"
import { getQCResult } from "@/lib/api"
import { useParams } from "next/navigation"
import { gradeHeroColor, gradeLabel, getGradeStyle } from "@/lib/grades"

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
                    <div className="text-sm text-gray-600">{new Date(data.timestamp).toLocaleString()}</div>
                </div>
            </header>

            {/* Overall Status */}
            <div className="mb-8 flex items-center justify-between bg-gray-50 p-6 border border-gray-200 rounded-sm">
                <div>
                    <div className="text-sm uppercase tracking-wider text-gray-500 font-semibold">Device Grade</div>
                    {data.overall_grade ? (
                        <>
                            <div className={`text-5xl font-bold mt-2 ${gradeHeroColor(data.overall_grade)}`}>
                                {data.overall_grade}
                            </div>
                            <div className="text-sm text-gray-600 mt-1">{gradeLabel(data.overall_grade)} — {data.overall_score}/100</div>
                        </>
                    ) : (
                        <div className={`text-5xl font-bold mt-2 ${data.overall_pass ? 'text-green-700' : 'text-red-700'}`}>
                            {data.overall_pass ? 'PASSED' : 'FAILED'}
                        </div>
                    )}
                </div>
                <div className="text-right">
                    <div className="text-sm uppercase tracking-wider text-gray-500 font-semibold mb-1">Machine ID</div>
                    <div className="font-mono text-xl">{data.machine_identifier}</div>
                </div>
            </div>

            {/* System Info Grid */}
            <div className="grid grid-cols-2 gap-x-12 gap-y-6 mb-8">
                <div>
                    <h3 className="uppercase tracking-widest text-xs font-bold border-b border-gray-300 pb-2 mb-3">System Specification</h3>
                    <table className="w-full text-sm">
                        <tbody>
                            <tr className="border-b border-dotted border-gray-300">
                                <td className="py-2 text-gray-600 w-1/3">Manufacturer</td>
                                <td className="py-2 font-medium">{data.system_manufacturer}</td>
                            </tr>
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
                                        {data.storage_details_json.totalCapacityGB?.toFixed(0)} GB
                                    </td>
                                </tr>
                            )}
                            {data.battery_details_json && (
                                <tr className="border-b border-dotted border-gray-300">
                                    <td className="py-2 text-gray-600">Battery Health</td>
                                    <td className="py-2 font-medium">
                                        Wear: {data.battery_details_json.wearLevelPercent}%
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Test Results Table */}
            <div className="mb-8">
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
                <div>Generated by Laptop QC Tool</div>
                <div>Test ID: #{data.id}</div>
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
