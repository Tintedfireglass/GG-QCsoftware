"use client"

import { useEffect, useState } from "react"
import { getQCResult } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Printer, Download } from "lucide-react"
import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import { getGradeStyle, gradeLabel, gradeHeroColor } from "@/lib/grades"
import { formatAppVersion, formatBytes, formatDbDateTime } from "@/lib/utils"

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

    // Helper to get grade badge
    const GradeBadge = ({ grade, score }: { grade?: string; score?: number }) => {
        if (!grade) return <span className="text-xs text-gray-400">—</span>;
        const s = getGradeStyle(grade);
        return (
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${s.bg} ${s.text}`}>
                {grade} — {score ?? 0}
            </span>
        );
    }

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
                                Date: {formatDbDateTime(data.timestamp)}
                            </p>
                            <p className="text-slate-500">
                                Device ID: {data.machine_identifier ?? data.machine_id}
                            </p>
                            <p className="text-slate-500">
                                App Version: {formatAppVersion(data.app_version)}
                            </p>
                            {data.health_id && (
                                <p className="text-slate-500 flex items-center gap-2 mt-1">
                                    Health ID: <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-700">{data.health_id}</span>
                                    <Link href={`/verify/${data.health_id}`} target="_blank" className="text-[var(--brand-purple)] hover:underline text-xs font-semibold">
                                        Verify
                                    </Link>
                                </p>
                            )}
                        </div>
                        <div className="text-right">
                            <div className="text-lg font-medium mb-1">PRAMAAN Score</div>
                            {data.pramaan_grade ? (
                                <>
                                    <div className={`text-5xl font-bold ${gradeHeroColor(data.pramaan_grade)}`}>{data.pramaan_grade}</div>
                                    <div className="text-sm text-slate-500 mt-1">{gradeLabel(data.pramaan_grade)} — {data.pramaan_score}/100</div>
                                </>
                            ) : (
                                data.overall_pass ? (
                                    <div className="text-4xl font-bold text-green-600">PASS</div>
                                ) : (
                                    <div className="text-4xl font-bold text-red-600">FAIL</div>
                                )
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
                                <div className="grid grid-cols-3">
                                    <dt className="font-medium text-slate-500">Windows Version</dt>
                                    <dd className="col-span-2">{data.system_info_json?.osVersion || "Unknown"}</dd>
                                </div>
                                <div className="grid grid-cols-3">
                                    <dt className="font-medium text-slate-500">Windows Activation</dt>
                                    <dd className="col-span-2">{activationText}</dd>
                                </div>
                                <div className="grid grid-cols-3">
                                    <dt className="font-medium text-slate-500">Antivirus Status</dt>
                                    <dd className="col-span-2">{antivirusText}</dd>
                                </div>
                                <div className="grid grid-cols-3">
                                    <dt className="font-medium text-slate-500">IP Address</dt>
                                    <dd className="col-span-2 font-mono">{data.submission_ip || "N/A"}</dd>
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
                                            {storageTotalLabel}
                                        </dd>
                                    </div>
                                )}
                                {/* Parse battery if available */}
                                {data.battery_details_json && (
                                    <div className="grid grid-cols-3">
                                        <dt className="font-medium text-slate-500">Battery</dt>
                                        <dd className="col-span-2">
                                            {data.battery_details_json.isTampered
                                                ? 'Battery Tampered - Unable to read data'
                                                : `${data.battery_details_json.wearLevelPercent}%`}
                                        </dd>
                                    </div>
                                )}
                                {data.battery_details_json && !data.battery_details_json.isTampered && batteryBrand && (
                                    <div className="grid grid-cols-3">
                                        <dt className="font-medium text-slate-500">Battery Brand</dt>
                                        <dd className="col-span-2">{batteryBrand}</dd>
                                    </div>
                                )}
                                {data.battery_details_json && !data.battery_details_json.isTampered && !hasCycleCount && (
                                    <div className="grid grid-cols-3">
                                        <dt className="font-medium text-slate-500">Cycle Count</dt>
                                        <dd className="col-span-2 text-slate-500 italic">Not reported by firmware</dd>
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

            {/* PRAMAAN Scoring Section */}
            {data.pramaan_score != null && (
                <Card className="border-t-4 border-t-emerald-600">
                    <CardContent className="p-8">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h2 className="text-2xl font-bold mb-1">PRAMAAN Health Score</h2>
                                <p className="text-sm text-slate-500">
                                    {data.pramaan_algorithm_version || 'Scoring Engine v1.0.0'}
                                </p>
                            </div>
                            <div className="text-right">
                                <div className={`text-5xl font-bold ${gradeHeroColor(data.pramaan_grade)}`}>{data.pramaan_grade}</div>
                                <div className="text-sm text-slate-500 mt-1">{gradeLabel(data.pramaan_grade)} — {data.pramaan_score}/100</div>
                            </div>
                        </div>

                        {/* Category Sub-Scores */}
                        {data.pramaan_category_scores && (
                            <div className="mt-6 pt-6 border-t">
                                <h3 className="font-semibold text-lg mb-4">Category Breakdown</h3>
                                <div className="grid gap-3">
                                    {Object.entries(data.pramaan_category_scores as Record<string, number>).map(([key, score]) => {
                                        const labels: Record<string, string> = {
                                            storage: 'Storage Health',
                                            thermal: 'Thermal Performance',
                                            battery: 'Battery Health',
                                            cpu_ram: 'CPU & RAM',
                                            physical_ports: 'Physical Ports',
                                            repair_modifier: 'Repair History',
                                        };
                                        const isRisk = data.pramaan_risk_flags?.[key] === true;
                                        const barColor = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-amber-500' : score >= 40 ? 'bg-orange-500' : 'bg-red-500';
                                        return (
                                            <div key={key} className="flex items-center gap-4">
                                                <div className="w-40 text-sm font-medium flex items-center gap-2">
                                                    {labels[key] || key}
                                                    {isRisk && (
                                                        <span className="inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                                                            RISK
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${score}%` }} />
                                                </div>
                                                <div className="w-10 text-right text-sm font-mono font-semibold">{score}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Risk Summary */}
                        {data.pramaan_risk_flags && Object.values(data.pramaan_risk_flags as Record<string, boolean>).some(v => v) && (
                            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                                <p className="text-sm font-semibold text-red-700">
                                    ⚠ Risk flags raised in: {Object.entries(data.pramaan_risk_flags as Record<string, boolean>)
                                        .filter(([, v]) => v)
                                        .map(([k]) => {
                                            const labels: Record<string, string> = {
                                                storage: 'Storage',
                                                thermal: 'Thermal',
                                                battery: 'Battery',
                                                cpu_ram: 'CPU/RAM',
                                                physical_ports: 'Ports',
                                                repair_modifier: 'Repair',
                                            };
                                            return labels[k] || k;
                                        })
                                        .join(', ')}
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Test Results List */}
            <h2 className="text-2xl font-bold pt-4">Test Details</h2>

            <div className="grid gap-4">
                {test_results.map((test: any) => {
                    const s = getGradeStyle(test.grade);
                    const borderClass = test.grade ? s.border : (test.passed ? 'border-l-green-500' : 'border-l-red-500');
                    return (
                        <Card key={test.id} className={`border-l-4 ${borderClass}`}>
                            <CardHeader className="py-4">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-base font-semibold">{test.test_type}</CardTitle>
                                    <GradeBadge grade={test.grade} score={test.score} />
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
                    );
                })}
            </div>
        </div>
    )
}
