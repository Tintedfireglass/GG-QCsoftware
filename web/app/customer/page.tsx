"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const plans = [
    { key: "monthly", name: "Monthly", price: "Rs.99 / month", detail: "Best for short-term testing needs." },
    { key: "yearly", name: "Yearly", price: "Rs.999 / year", detail: "Most popular for regular users." },
    { key: "lifetime", name: "Lifetime", price: "Rs.2999 one-time", detail: "Single purchase, no renewal." },
]

export default function CustomerLandingPage() {
    return (
        <div className="min-h-screen bg-slate-50">
            <div className="mx-auto max-w-6xl px-6 py-14">
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-bold tracking-tight text-slate-900">PRAMAAN for Individuals</h1>
                    <p className="mt-3 text-slate-600">
                        Buy a personal subscription, receive your license key, and activate the desktop QC tool.
                    </p>
                    <div className="mt-6 flex justify-center gap-3">
                        <Link href="/customer/register"><Button>Create Account</Button></Link>
                        <Link href="/customer/login"><Button variant="outline">Customer Login</Button></Link>
                    </div>
                </div>

                <div className="grid gap-6 md:grid-cols-3">
                    {plans.map((plan) => (
                        <Card key={plan.key} className="border-slate-200">
                            <CardHeader>
                                <CardTitle>{plan.name}</CardTitle>
                                <CardDescription>{plan.detail}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-semibold text-slate-900 mb-4">{plan.price}</div>
                                <Link href={`/customer/register?plan=${plan.key}`}>
                                    <Button className="w-full">Get Started</Button>
                                </Link>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    )
}
