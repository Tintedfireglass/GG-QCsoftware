"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"

function Content() {
    const sp = useSearchParams()
    const status = sp.get("status")
    const message = sp.get("message")
    const ok = status === "success"

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 max-w-md w-full p-8 text-center">
                <div
                    className={`mx-auto h-14 w-14 rounded-full flex items-center justify-center text-3xl ${ok ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}
                >
                    {ok ? "✓" : "✕"}
                </div>
                <h1 className="text-2xl font-bold text-slate-900 mt-4">
                    {ok ? "Payment successful" : "Payment not completed"}
                </h1>
                {ok ? (
                    <p className="text-slate-600 mt-2">
                        Thank you! Your license key and account login details have been sent to your email.
                        Please check your inbox (and spam folder).
                    </p>
                ) : (
                    <p className="text-slate-600 mt-2">
                        {message || "Your payment was cancelled or could not be completed. You have not been charged."}
                    </p>
                )}

                <div className="mt-6 flex flex-col gap-2">
                    {/* <Link
                        href="/customer/login"
                        className="w-full inline-flex items-center justify-center h-11 rounded-lg bg-[var(--brand-purple)] text-white font-medium hover:opacity-90"
                    >
                        {ok ? "Log in to your account" : "Go to login"}
                    </Link> */}
                    <a href="https://pramaan.gadgetguruz.com" className="text-sm text-slate-500 hover:underline mt-1">
                        Back to website
                    </a>
                </div>
            </div>
        </div>
    )
}

export default function CheckoutCompletePage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
            <Content />
        </Suspense>
    )
}
