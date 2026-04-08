"use client"

import { useEffect, useMemo, useState } from "react"
import { getQCResult } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Printer } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { getGradeStyle, gradeLabel, gradeHeroColor } from "@/lib/grades"
import { formatAppVersion, formatBytes, formatDbDateTime } from "@/lib/utils"

export default function ResultDetailPage() {
    const { id } = useParams()
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [selectedGrades, setSelectedGrades] = useState<string[]>([])
    const [isGradeFilterOpen, setIsGradeFilterOpen] = useState(false)
    const [testSort, setTestSort] = useState<"grade_desc" | "grade_asc" | "name_az">("grade_desc")

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

    const gradeOptions = ["A+", "A", "B", "C", "Unknown"]
    const gradeOrder: Record<string, number> = {
        "A+": 0,
        "A": 1,
        "B": 2,
        "C": 3,
        "Unknown": 4
    }

    const getGradeKey = (grade?: string) => {
        if (!grade) return "Unknown"
        const g = grade.toUpperCase() === "REJECT" ? "Reject" : grade.toUpperCase()
        if (g === "A+") return "A+"
        if (g === "A") return "A"
        if (g === "B") return "B"
        if (g === "C") return "C"
        if (g === "D" || g === "E" || g === "F") return "Unknown"
        if (g === "REJECT") return "Unknown"
        return "Unknown"
    }

    const isGradeSelected = (gradeKey: string) =>
        selectedGrades.length === 0 || selectedGrades.includes(gradeKey)

    const toggleGrade = (grade: string) => {
        setSelectedGrades((prev) =>
            prev.includes(grade) ? prev.filter((g) => g !== grade) : [...prev, grade]
        )
    }

    const totalTests = test_results.length
    const filteredTests = useMemo(() => {
        return test_results.filter((t: any) => isGradeSelected(getGradeKey(t?.grade)))
    }, [test_results, selectedGrades])

    const sortedTests = useMemo(() => {
        const list = [...filteredTests]
        if (testSort === "grade_desc") {
            return list.sort((a: any, b: any) => {
                const aRank = gradeOrder[getGradeKey(a?.grade)] ?? gradeOrder.Unknown
                const bRank = gradeOrder[getGradeKey(b?.grade)] ?? gradeOrder.Unknown
                if (aRank !== bRank) return aRank - bRank
                return String(a?.test_type || "").localeCompare(String(b?.test_type || ""))
            })
        }
        if (testSort === "grade_asc") {
            return list.sort((a: any, b: any) => {
                const aRank = gradeOrder[getGradeKey(a?.grade)] ?? gradeOrder.Unknown
                const bRank = gradeOrder[getGradeKey(b?.grade)] ?? gradeOrder.Unknown
                if (aRank !== bRank) return bRank - aRank
                return String(a?.test_type || "").localeCompare(String(b?.test_type || ""))
            })
        }
        return list.sort((a: any, b: any) => String(a?.test_type || "").localeCompare(String(b?.test_type || "")))
    }, [filteredTests, testSort])

    const pramaanGradeKey = getGradeKey(data?.pramaan_grade)
    const showPramaanSection = data.pramaan_score != null && isGradeSelected(pramaanGradeKey)

    // Helper to get grade badge
    const GradeBadge = ({ grade, score }: { grade?: string; score?: number }) => {
        if (!grade) return <span className="text-xs text-gray-400">Unknown</span>;
        const s = getGradeStyle(grade);
        return (
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${s.bg} ${s.text}`}>
                {grade} - {score ?? 0}
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
                    <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4 md:gap-0">
                        <div>
                            <h1 className="text-3xl font-bold mb-2">QC Report: #{data.id}</h1>
                            <p className="text-slate-500">
                                Date: {formatDbDateTime(data.timestamp)}
                            </p>
                            <p className="text-slate-500">
                                Device ID: {data.machine_id}
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
                                    <div className="text-sm text-slate-500 mt-1">{gradeLabel(data.pramaan_grade)} - {data.pramaan_score}/100</div>
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6 pt-6 border-t">
                        <div>
                            <h3 className="font-semibold text-lg mb-4">System Information</h3>
                            <dl className="space-y-2 text-sm">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                    <dt className="font-medium text-slate-500">Manufacturer</dt>
                                    <dd className="sm:col-span-2 text-slate-900 break-words">{data.system_manufacturer}</dd>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                    <dt className="font-medium text-slate-500">Model</dt>
                                    <dd className="sm:col-span-2 text-slate-900 break-words">{data.system_model}</dd>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                    <dt className="font-medium text-slate-500">Serial Number</dt>
                                    <dd className="sm:col-span-2 font-mono text-slate-900 break-all">{data.system_serial}</dd>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                    <dt className="font-medium text-slate-500">MAC Address</dt>
                                    <dd className="sm:col-span-2 font-mono text-slate-900 break-all">{data.mac_address}</dd>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                    <dt className="font-medium text-slate-500">Windows Version</dt>
                                    <dd className="sm:col-span-2 text-slate-900 break-words">{data.system_info_json?.osVersion || "Unknown"}</dd>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                    <dt className="font-medium text-slate-500">Windows Activation</dt>
                                    <dd className="sm:col-span-2 text-slate-900 break-words">{activationText}</dd>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                    <dt className="font-medium text-slate-500">Antivirus Status</dt>
                                    <dd className="sm:col-span-2 text-slate-900 break-words">{antivirusText}</dd>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                    <dt className="font-medium text-slate-500">IP Address</dt>
                                    <dd className="sm:col-span-2 font-mono text-slate-900 break-all">{data.submission_ip || "N/A"}</dd>
                                </div>
                            </dl>
                        </div>

                        <div>
                            <h3 className="font-semibold text-lg mb-4">Hardware Specs</h3>
                            <dl className="space-y-2 text-sm">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                    <dt className="font-medium text-slate-500">CPU</dt>
                                    <dd className="sm:col-span-2 text-slate-900 break-words">{data.cpu_model}</dd>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                    <dt className="font-medium text-slate-500">RAM</dt>
                                    <dd className="sm:col-span-2 text-slate-900 break-words">
                                        {data.ram_total ? Math.round(data.ram_total / (1024 * 1024 * 1024)) : 0} GB
                                    </dd>
                                </div>
                                {/* Parse storage if available */}
                                {data.storage_details_json && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                        <dt className="font-medium text-slate-500">Storage</dt>
                                        <dd className="sm:col-span-2 text-slate-900 break-words">
                                            {storageTotalLabel}
                                        </dd>
                                    </div>
                                )}
                                {/* Parse battery if available */}
                                {data.battery_details_json && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                        <dt className="font-medium text-slate-500">Battery</dt>
                                        <dd className="sm:col-span-2 text-slate-900 break-words">
                                            {data.battery_details_json.isTampered
                                                ? 'Battery Tampered - Unable to read data'
                                                : `${data.battery_details_json.wearLevelPercent}%`}
                                        </dd>
                                    </div>
                                )}
                                {data.battery_details_json && !data.battery_details_json.isTampered && batteryBrand && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                        <dt className="font-medium text-slate-500">Battery Brand</dt>
                                        <dd className="sm:col-span-2 text-slate-900 break-words">{batteryBrand}</dd>
                                    </div>
                                )}
                                {data.battery_details_json && !data.battery_details_json.isTampered && !hasCycleCount && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                        <dt className="font-medium text-slate-500">Cycle Count</dt>
                                        <dd className="sm:col-span-2 text-slate-500 italic break-words">Not reported by firmware</dd>
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
            {showPramaanSection && (
                <Card className="border-t-4 border-t-emerald-600">
                    <CardContent className="p-8">
                        <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4 md:gap-0">
                            <div>
                                <h2 className="text-2xl font-bold mb-1">PRAMAAN Health Score</h2>
                                <p className="text-sm text-slate-500">
                                    {data.pramaan_algorithm_version || 'Scoring Engine v1.0.0'}
                                </p>
                            </div>
                            <div className="text-right">
                                <div className={`text-5xl font-bold ${gradeHeroColor(data.pramaan_grade)}`}>{data.pramaan_grade}</div>
                                <div className="text-sm text-slate-500 mt-1">{gradeLabel(data.pramaan_grade)} - {data.pramaan_score}/100</div>
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
                                    Risk flags raised in: {Object.entries(data.pramaan_risk_flags as Record<string, boolean>)
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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4">
                <div>
                    <h2 className="text-2xl font-bold">Test Details</h2>
                    <p className="text-xs text-slate-500 mt-1">
                        Showing {sortedTests.length} of {totalTests} tests
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => setIsGradeFilterOpen((v) => !v)}
                        >
                            Filter: {selectedGrades.length === 0 ? "All grades" : `${selectedGrades.length} selected`}
                        </Button>
                        {isGradeFilterOpen && (
                            <div className="absolute right-0 mt-2 w-56 rounded-md border border-slate-200 bg-white shadow-lg z-10">
                                <div className="px-3 py-2 text-xs text-slate-500">Grades</div>
                                <div className="px-3 text-[11px] text-slate-400">No selection = all grades</div>
                                <div className="max-h-56 overflow-auto pb-1">
                                    {gradeOptions.map((grade) => (
                                        <label key={grade} className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700">
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4"
                                                checked={selectedGrades.includes(grade)}
                                                onChange={() => toggleGrade(grade)}
                                            />
                                            <span>{grade}</span>
                                        </label>
                                    ))}
                                </div>
                                <div className="border-t border-slate-100 px-3 py-2">
                                    <button
                                        type="button"
                                        className="text-xs text-slate-600 hover:text-slate-900"
                                        onClick={() => setSelectedGrades([])}
                                    >
                                        Clear filters
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                    <select
                        value={testSort}
                        onChange={(e) => setTestSort(e.target.value as typeof testSort)}
                        className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700"
                        aria-label="Sort tests"
                    >
                        <option value="grade_desc">Sort: Grade high to low</option>
                        <option value="grade_asc">Sort: Grade low to high</option>
                        <option value="name_az">Sort: Name A-Z</option>
                    </select>
                </div>
            </div>

            <div className="grid gap-4">
                {sortedTests.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg">
                        No tests for selected grades.
                    </div>
                ) : (
                    sortedTests.map((test: any) => {
                        const s = getGradeStyle(test.grade);
                        const borderClass = s.border;
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
                    })
                )}
            </div>
        </div>
    )
}
