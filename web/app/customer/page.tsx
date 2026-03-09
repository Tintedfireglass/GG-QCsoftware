"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function CustomerLandingPage() {
    return (
        <div className="min-h-screen bg-slate-50">
            <div className="mx-auto max-w-6xl px-6 py-14">
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-bold tracking-tight text-slate-900">PRAMAAN for Individuals</h1>
                    <p className="mt-3 text-slate-600">
                        One-time purchase. Pay Rs.199, receive your license key, and activate the desktop QC tool.
                    </p>
                    <div className="mt-6 flex justify-center gap-3">
                        <Link href="/customer/register"><Button>Create Account</Button></Link>
                        <Link href="/customer/login"><Button variant="outline">Customer Login</Button></Link>
                    </div>
                </div>

                <div className="mx-auto max-w-md">
                    <Card className="border-slate-200">
                        <CardHeader>
                            <CardTitle>Personal License</CardTitle>
                            <CardDescription>Single purchase, no renewal.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-semibold text-slate-900 mb-4">Rs.199 one-time</div>
                            <Link href="/customer/register">
                                <Button className="w-full">Get Started</Button>
                            </Link>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
