import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cn } from "@/lib/utils"

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    asChild?: boolean
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
    size?: "default" | "sm" | "lg" | "icon"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : "button"

        // Variant styles
        const variants = {
            default: "bg-blue-600 text-white hover:bg-blue-700 shadow-sm",
            destructive: "bg-red-500 text-white hover:bg-red-600 shadow-sm",
            outline: "border border-slate-200 bg-white hover:bg-slate-100 hover:text-slate-900",
            secondary: "bg-slate-100 text-slate-900 hover:bg-slate-100/80",
            ghost: "hover:bg-slate-100 hover:text-slate-900",
            link: "text-slate-900 underline-offset-4 hover:underline",
        }

        // Size styles
        const sizes = {
            default: "h-9 px-4 py-2",
            sm: "h-8 rounded-md px-3 text-xs",
            lg: "h-10 rounded-md px-8",
            icon: "h-9 w-9",
        }

        return (
            <Comp
                className={cn(
                    "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                    variants[variant],
                    sizes[size],
                    className
                )}
                ref={ref}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"

export { Button }
