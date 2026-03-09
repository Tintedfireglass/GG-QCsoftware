"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getMachines } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Monitor, ExternalLink } from "lucide-react"
import { formatDbDate } from "@/lib/utils"

export default function MachinesPage() {
    const router = useRouter()
    const [machines, setMachines] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function load() {
            try {
                const data = await getMachines()
                setMachines(data.machines)
            } catch (error) {
                console.error(error)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [])

    if (loading) return <div className="p-8 text-center text-slate-500">Loading machines...</div>

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Registered Machines</h1>

            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {machines.map((machine) => (
                    <Card key={machine.id} className="shadow-none border border-slate-200">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center">
                                    <Monitor className="h-5 w-5 text-emerald-600" />
                                </div>
                                <div>
                                    <CardTitle className="text-base font-semibold text-slate-900">
                                        {machine.machine_id}
                                    </CardTitle>
                                    <div className="text-xs text-slate-500 mt-0.5">
                                        Last seen: {formatDbDate(machine.last_seen)}
                                    </div>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-4">
                            <div className="flex items-center justify-between mb-4">
                                <div className="text-sm text-slate-500">Serial no.</div>
                                <div className="text-sm font-medium text-slate-900">{machine.serial_number || "N/A"}</div>
                            </div>

                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-2xl font-bold text-slate-900 leading-none">
                                        {machine.test_count}
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1">Total Tests</div>
                                </div>
                                <Button
                                    variant="outline"
                                    className="rounded-full px-5 border-slate-200 text-slate-600 hover:text-[var(--brand-purple)] hover:border-[var(--brand-purple)] bg-white shadow-sm h-9 text-sm font-medium"
                                    onClick={() => router.push(`/dashboard/machines/${machine.id}`)}
                                >
                                    View Latest Report
                                    <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
                {machines.length === 0 && (
                    <p className="col-span-full text-center text-slate-500 py-10">
                        No machines registered yet. Run the desktop app to register.
                    </p>
                )}
            </div>
        </div>
    )
}
