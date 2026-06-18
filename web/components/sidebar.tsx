"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
import { cn } from "@/lib/utils"
import {
    LayoutDashboard,
    Layers,
    Monitor,
    LogOut,
    Users,
    UserPlus,
    Contact,
    Shield,
    Key,
    Server,
    Hourglass,
    CreditCard,
    Package,
    ShoppingCart,
    Ticket,
    BarChart3,
    Mail,
    Settings,
    AtSign,
    DownloadCloud,
    MessageSquare,
    LifeBuoy,
    Code2
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
    const { logout, user, canManageUsers, canViewMachines, canManageFleet, getRoleDisplayName } = useAuth()

    // Define navigation links with role-based visibility
    const links: NavLink[] = [
        {
            href: "/dashboard",
            label: "Overview",
            icon: LayoutDashboard
        },
        {
            href: "/dashboard/reports",
            label: "All Reports",
            icon: Layers
        },
        // Fleet Management – hidden while still in development
        // {
        //     href: "/dashboard/fleet",
        //     label: "Fleet",
        //     icon: Server,
        //     roles: ['Enterprise'],
        // },
        {
            href: "/dashboard/machines",
            label: "Machines",
            icon: Monitor,
            roles: ['SuperAdmin', 'Enterprise', 'Reseller'] // Visible to SuperAdmin, Enterprise, Reseller
        },
        {
            href: "/dashboard/users",
            label: "User Management",
            icon: Users,
            roles: ['SuperAdmin', 'Refurbisher', 'Enterprise', 'Reseller'] // Visible to user managers
        },
        {
            href: "/dashboard/licenses",
            label: "Licenses",
            icon: Key,
            roles: ['SuperAdmin', 'Employee', 'Refurbisher', 'Enterprise', 'Reseller', 'Client'] // Visible to license managers
        },
        {
            href: "/dashboard/free-trials",
            label: "Free Trials",
            icon: Hourglass,
            roles: ['SuperAdmin']
        },
        {
            href: "/dashboard/plans",
            label: "Pricing Plans",
            icon: Package,
            roles: ['SuperAdmin']
        },
        {
            href: "/dashboard/customers",
            label: "Customers",
            icon: Contact,
            roles: ['SuperAdmin']
        },
        {
            href: "/dashboard/orders",
            label: "Orders",
            icon: ShoppingCart,
            roles: ['SuperAdmin']
        },
        {
            href: "/dashboard/coupons",
            label: "Coupons",
            icon: Ticket,
            roles: ['SuperAdmin']
        },
        {
            href: "/dashboard/analytics",
            label: "Analytics",
            icon: BarChart3,
            roles: ['SuperAdmin']
        },
        {
            href: "/dashboard/contacts",
            label: "Contacts",
            icon: Mail,
            roles: ['SuperAdmin']
        },
        {
            href: "/dashboard/support",
            label: "Support",
            icon: LifeBuoy,
            roles: ['SuperAdmin']
        },
        {
            href: "/dashboard/payment-gateways",
            label: "Payment Gateways",
            icon: CreditCard,
            roles: ['SuperAdmin']
        },
        {
            href: "/dashboard/email",
            label: "Email Settings",
            icon: AtSign,
            roles: ['SuperAdmin']
        },
        {
            href: "/dashboard/sms",
            label: "SMS Settings",
            icon: MessageSquare,
            roles: ['SuperAdmin']
        },
        {
            href: "/dashboard/releases",
            label: "App Updates",
            icon: DownloadCloud,
            roles: ['SuperAdmin']
        },
        {
            href: "/dashboard/settings",
            label: "System Settings",
            icon: Settings,
            roles: ['SuperAdmin']
        },
        {
            href: "/dashboard/api-reference",
            label: "API Reference",
            icon: Code2,
            roles: ['SuperAdmin']
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
            case 'Employee':
                return 'bg-rose-500'
            case 'Refurbisher':
                return 'bg-blue-500'
            case 'Enterprise':
                return 'bg-amber-500'
            case 'Reseller':
                return 'bg-indigo-500'
            case 'Technician':
                return 'bg-green-500'
            case 'Client':
                return 'bg-teal-500'
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
