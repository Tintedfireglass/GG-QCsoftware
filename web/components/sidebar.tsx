"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
import { cn } from "@/lib/utils"
import {
    LayoutDashboard,
    ClipboardList,
    Monitor,
    LogOut,
    Laptop,
    Users,
    UserPlus,
    Shield
} from "lucide-react"
import { UserRoleDisplayNames } from "@/lib/types"

interface NavLink {
    href: string
    label: string
    icon: React.ComponentType<{ className?: string }>
    roles?: ('SuperAdmin' | 'Admin' | 'User')[] // If undefined, visible to all
}

export function Sidebar() {
    const pathname = usePathname()
    const { logout, user, canManageUsers, canViewMachines, getRoleDisplayName } = useAuth()

    // Define navigation links with role-based visibility
    const links: NavLink[] = [
        {
            href: "/dashboard",
            label: "Overview",
            icon: LayoutDashboard
        },
        {
            href: "/dashboard/results",
            label: "QC Results",
            icon: ClipboardList
        },
        {
            href: "/dashboard/machines",
            label: "Machines",
            icon: Monitor,
            roles: ['SuperAdmin', 'Admin'] // Only visible to SuperAdmin and Admin
        },
        {
            href: "/dashboard/users",
            label: "User Management",
            icon: Users,
            roles: ['SuperAdmin', 'Admin'] // Only visible to SuperAdmin and Admin
        },
    ]

    // Filter links based on user role
    const visibleLinks = links.filter(link => {
        if (!link.roles) return true // No role restriction
        if (!user) return false
        return link.roles.includes(user.role)
    })

    // Get role badge color
    const getRoleBadgeColor = () => {
        switch (user?.role) {
            case 'SuperAdmin':
                return 'bg-purple-500'
            case 'Admin':
                return 'bg-blue-500'
            case 'User':
                return 'bg-green-500'
            default:
                return 'bg-slate-500'
        }
    }

    return (
        <div className="flex h-screen w-64 flex-col border-r bg-slate-900 text-white">
            <div className="flex h-16 items-center px-6 border-b border-slate-800">
                <Laptop className="h-6 w-6 mr-2 text-blue-400" />
                <span className="font-bold text-lg">LaptopQC</span>
            </div>

            <div className="flex-1 py-4">
                <nav className="space-y-1 px-2">
                    {visibleLinks.map((link) => {
                        const Icon = link.icon
                        const isActive = pathname === link.href ||
                            (link.href !== "/dashboard" && pathname.startsWith(link.href))
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={cn(
                                    "flex items-center px-4 py-3 text-sm font-medium rounded-md transition-colors",
                                    isActive
                                        ? "bg-blue-600 text-white"
                                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                                )}
                            >
                                <Icon className="mr-3 h-5 w-5" />
                                {link.label}
                            </Link>
                        )
                    })}
                </nav>
            </div>

            <div className="border-t border-slate-800 p-4">
                <div className="flex items-center mb-4 px-2">
                    <div className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold",
                        getRoleBadgeColor()
                    )}>
                        {user?.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="ml-3 flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{user?.display_name || user?.username}</p>
                        <div className="flex items-center gap-1">
                            <Shield className="h-3 w-3 text-slate-400" />
                            <p className="text-xs text-slate-400">{getRoleDisplayName()}</p>
                        </div>
                    </div>
                </div>
                <button
                    onClick={logout}
                    className="flex w-full items-center px-2 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white rounded-md transition-colors"
                >
                    <LogOut className="mr-3 h-5 w-5" />
                    Sign Out
                </button>
            </div>
        </div>
    )
}

