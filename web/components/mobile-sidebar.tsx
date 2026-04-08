"use client"

import { useState } from "react"
import { Menu, X } from "lucide-react"
import { Sidebar } from "./sidebar"
import Image from "next/image"

export function MobileSidebar() {
    const [open, setOpen] = useState(false)

    return (
        <div className="md:hidden">
            {/* Top Bar for Mobile */}
            <div className="flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white px-4">
                <Image src="/prmn_logo.png" alt="PRAMAAN Logo" width={120} height={28} className="w-auto h-6 object-contain" />
                <button
                    onClick={() => setOpen(true)}
                    className="p-2 -mr-2 text-slate-600 hover:text-slate-900"
                    aria-label="Open mobile menu"
                >
                    <Menu className="h-6 w-6" />
                </button>
            </div>

            {/* Overlay and Drawer */}
            {open && (
                <div className="fixed inset-0 z-50 flex">
                    {/* Backdrop */}
                    <div 
                        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
                        onClick={() => setOpen(false)}
                        aria-hidden="true"
                    />
                    
                    {/* Slide-over */}
                    <div className="relative flex w-64 max-w-[calc(100%-3rem)] flex-col bg-white shadow-xl">
                        <button
                            onClick={() => setOpen(false)}
                            className="absolute -right-12 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                            aria-label="Close mobile menu"
                        >
                            <X className="h-6 w-6" />
                        </button>
                        
                        {/* Sidebar content */}
                        <div className="h-full w-full overflow-y-auto" onClick={() => setOpen(false)}>
                            <Sidebar />
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
