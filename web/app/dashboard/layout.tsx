import { Sidebar } from "@/components/sidebar"
import { MobileSidebar } from "@/components/mobile-sidebar"

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="flex h-screen bg-slate-50 flex-col md:flex-row">
            <MobileSidebar />
            <div className="hidden md:flex flex-col">
                <Sidebar />
            </div>
            <main className="flex-1 overflow-y-auto w-full">
                <div className="p-4 md:p-8 w-full max-w-full overflow-x-hidden">
                    {children}
                </div>
            </main>
        </div>
    )
}
