"use client"

import { useEffect, useState } from "react"
import { getMachines } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Monitor, Calendar, CheckCircle, XCircle } from "lucide-react"
import { formatDbDate } from "@/lib/utils"

export default function MachinesPage() {
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

    if (loading) return <div className="p-8 text-center">Loading machines...</div>

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold tracking-tight">Registered Machines</h1>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {machines.map((machine) => (
                    <Card key={machine.id}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                {machine.machine_id}
                            </CardTitle>
                            <Monitor className="h-4 w-4 text-slate-500" />
                        </CardHeader>
                        <CardContent className="mt-4">
                            <div className="text-2xl font-bold mb-1">
                                {machine.test_count} <span className="text-sm font-normal text-slate-500">Tests</span>
                            </div>
                            <div className="flex gap-4 text-xs mt-2 mb-4">
                                <div className="flex items-center text-green-600">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    {machine.passed_count} Pass
                                </div>
                                <div className="flex items-center text-red-600">
                                    <XCircle className="h-3 w-3 mr-1" />
                                    {machine.failed_count} Fail
                                </div>
                            </div>

                            <div className="space-y-1 pt-4 border-t text-xs text-slate-500">
                                <div className="flex justify-between">
                                    <span>Last Seen:</span>
                                    <span className="font-medium text-slate-900">
                                        {formatDbDate(machine.last_seen)}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Serial:</span>
                                    <span className="font-mono">{machine.serial_number || "N/A"}</span>
                                </div>
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
