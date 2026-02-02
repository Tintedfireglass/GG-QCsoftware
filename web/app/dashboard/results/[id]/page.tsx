"use client"

import { useEffect, useState } from "react"
import { getQCResult } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Printer, Download } from "lucide-react"
import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"

export default function ResultDetailPage() {
    const { id } = useParams()
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    // Handle auto-print removed (moved to dedicated page)

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

    if (loading) return <div className="p-8">Loading result details...</div>
    if (!data) return <div className="p-8">Result not found</div>

    const { test_results = [] } = data

    // Helper to get status color
    const StatusBadge = ({ passed }: { passed: boolean }) => (
        passed ? (
            <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-800">
                PASS
            </span>
        ) : (
            <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-800">
                FAIL
            </span>
        )
    )

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-10">
            {/* Header Navigation */}
            <div className="flex items-center justify-between no-print">
                <Link href="/dashboard/results">
                    <Button variant="ghost" size="sm">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Results
                    </Button>
                </Link>
                <div className="space-x-2">
                    <Link href={`/report/${id}`} target="_blank">
                        <Button variant="outline" size="sm">
                            <Printer className="h-4 w-4 mr-2" />
                            Print
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Report Header */}
            <Card className="border-t-4 border-t-blue-600">
                <CardContent className="p-8">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h1 className="text-3xl font-bold mb-2">QC Report: #{data.id}</h1>
                            <p className="text-slate-500">
                                Date: {new Date(data.timestamp).toLocaleString()}
                            </p>
                            <p className="text-slate-500">
                                Machine: {data.machine_identifier}
                            </p>
                        </div>
                        <div className="text-right">
                            <div className="text-lg font-medium mb-1">Overall Status</div>
                            {data.overall_pass ? (
                                <div className="text-4xl font-bold text-green-600">PASS</div>
                            ) : (
                                <div className="text-4xl font-bold text-red-600">FAIL</div>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-8 mt-6 pt-6 border-t">
                        <div>
                            <h3 className="font-semibold text-lg mb-4">System Information</h3>
                            <dl className="space-y-2 text-sm">
                                <div className="grid grid-cols-3">
                                    <dt className="font-medium text-slate-500">Manufacturer</dt>
                                    <dd className="col-span-2">{data.system_manufacturer}</dd>
                                </div>
                                <div className="grid grid-cols-3">
                                    <dt className="font-medium text-slate-500">Model</dt>
                                    <dd className="col-span-2">{data.system_model}</dd>
                                </div>
                                <div className="grid grid-cols-3">
                                    <dt className="font-medium text-slate-500">Serial Number</dt>
                                    <dd className="col-span-2 font-mono">{data.system_serial}</dd>
                                </div>
                                <div className="grid grid-cols-3">
                                    <dt className="font-medium text-slate-500">MAC Address</dt>
                                    <dd className="col-span-2 font-mono">{data.mac_address}</dd>
                                </div>
                            </dl>
                        </div>

                        <div>
                            <h3 className="font-semibold text-lg mb-4">Hardware Specs</h3>
                            <dl className="space-y-2 text-sm">
                                <div className="grid grid-cols-3">
                                    <dt className="font-medium text-slate-500">CPU</dt>
                                    <dd className="col-span-2">{data.cpu_model}</dd>
                                </div>
                                <div className="grid grid-cols-3">
                                    <dt className="font-medium text-slate-500">RAM</dt>
                                    <dd className="col-span-2">
                                        {data.ram_total ? Math.round(data.ram_total / (1024 * 1024 * 1024)) : 0} GB
                                    </dd>
                                </div>
                                {/* Parse storage if available */}
                                {data.storage_details_json && (
                                    <div className="grid grid-cols-3">
                                        <dt className="font-medium text-slate-500">Storage</dt>
                                        <dd className="col-span-2">
                                            {data.storage_details_json.TotalCapacityGB?.toFixed(0)} GB
                                        </dd>
                                    </div>
                                )}
                                {/* Parse battery if available */}
                                {data.battery_details_json && (
                                    <div className="grid grid-cols-3">
                                        <dt className="font-medium text-slate-500">Battery Wear</dt>
                                        <dd className="col-span-2">
                                            {data.battery_details_json.WearLevelPercent}%
                                        </dd>
                                    </div>
                                )}
                            </dl>
                        </div>
                    </div>

                    {data.technician_notes && (
                        <div className="mt-6 pt-6 border-t">
                            <h3 className="font-semibold text-sm mb-2 text-slate-500">Technician Notes</h3>
                            <p className="bg-slate-50 p-3 rounded text-sm italic">{data.technician_notes}</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Test Results List */}
            <h2 className="text-2xl font-bold pt-4">Test Details</h2>

            <div className="grid gap-4">
                {test_results.map((test: any) => (
                    <Card key={test.id} className={test.passed ? "border-l-4 border-l-green-500" : "border-l-4 border-l-red-500"}>
                        <CardHeader className="py-4">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base font-semibold">{test.test_type}</CardTitle>
                                <StatusBadge passed={test.passed} />
                            </div>
                        </CardHeader>
                        <CardContent className="pb-4 pt-0">
                            <p className="text-sm mb-2">{test.message}</p>

                            {/* Render JSON details if available */}
                            {test.details_json && Array.isArray(test.details_json) && test.details_json.length > 0 && (
                                <ul className="list-disc pl-5 space-y-1 mt-2 bg-slate-50 p-2 rounded">
                                    {test.details_json.map((detail: string, i: number) => (
                                        <li key={i} className="text-xs text-slate-600">{detail}</li>
                                    ))}
                                </ul>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}
