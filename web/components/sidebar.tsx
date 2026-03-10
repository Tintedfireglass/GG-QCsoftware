"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
import { cn } from "@/lib/utils"
import {
    LayoutDashboard,
    ClipboardList,
    Monitor,
    LogOut,
    Users,
    UserPlus,
    Shield,
    Key
} from "lucide-react"
import { UserRole, UserRoleDisplayNames } from "@/lib/types"

interface NavLink {
    href: string
    label: string
    icon: React.ComponentType<{ className?: string }>
    roles?: UserRole[] // If undefined, visible to all
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
        {
            href: "/dashboard/licenses",
            label: "Licenses",
            icon: Key,
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
        <div className="flex h-screen w-64 flex-col border-r border-slate-200 bg-white text-slate-700">
            <div className="flex h-20 items-center px-6 border-b border-transparent">
                <Image src="/prmn_logo.png" alt="PRAMAAN Logo" width={160} height={36} className="w-auto h-8 object-contain" />
            </div>

            <div className="flex-1 py-4">
                <nav className="space-y-2 px-4">
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
                                        ? "bg-[var(--brand-purple)] text-white shadow-sm"
                                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                )}
                            >
                                <Icon className={cn("mr-3 h-5 w-5", isActive ? "text-white" : "text-slate-400")} />
                                {link.label}
                            </Link>
                        )
                    })}
                </nav>
            </div>

            <div className="p-4 border-t border-slate-100">
                <div className="flex items-center mb-4 px-2">
                    <div className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold text-white",
                        getRoleBadgeColor()
                    )}>
                        {user?.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="ml-3 flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{user?.display_name || user?.username}</p>
                        <div className="flex items-center gap-1">
                            <Shield className="h-3 w-3 text-slate-400" />
                            <p className="text-xs text-slate-500">{getRoleDisplayName()}</p>
                        </div>
                    </div>
                </div>
                <button
                    onClick={logout}
                    className="flex w-full items-center px-2 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900 rounded-md transition-colors"
                >
                    <LogOut className="mr-3 h-5 w-5 text-slate-400" />
                    Sign Out
                </button>
            </div>
        </div>
    )
}
