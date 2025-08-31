import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
    "inline-flex items-center justify-center whitespace-nowrap rounded-lg font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
    {
        variants: {
            variant: {
                // Primary - Heat color for main CTAs
                default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm hover:shadow-md",
                
                // Heat - Special variant with glow effect
                heat: "bg-heat text-bone hover:bg-heat/90 shadow-heat hover:shadow-[0_0_30px_rgba(233,74,61,0.6)] transition-shadow duration-220",
                
                // Secondary - Subtle with border
                secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border shadow-sm",
                
                // Outline - Clean border style
                outline: "border border-border bg-background hover:bg-accent hover:text-accent-foreground shadow-sm hover:shadow-md",
                
                // Ghost - Minimal hover state
                ghost: "hover:bg-accent hover:text-accent-foreground",
                
                // Destructive - For dangerous actions
                destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
                
                // Link - Text-only style
                link: "text-primary underline-offset-4 hover:underline p-0 h-auto",
                
                // Neon - Special accent variant
                neon: "bg-neon text-ink hover:bg-neon/90 shadow-neon hover:shadow-[0_0_30px_rgba(195,255,208,0.8)] transition-shadow duration-220",
                
                // Glass - Glassmorphism effect
                glass: "glass hover:bg-background/90 backdrop-blur-md",
            },
            size: {
                sm: "h-8 px-3 text-xs rounded-md",
                default: "h-10 px-4 py-2 text-sm",
                lg: "h-12 px-6 text-base rounded-xl",
                xl: "h-14 px-8 text-lg rounded-xl",
                icon: "h-10 w-10",
                "icon-sm": "h-8 w-8",
                "icon-lg": "h-12 w-12",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
)

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean
    loading?: boolean
    leftIcon?: React.ReactNode
    rightIcon?: React.ReactNode
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ 
        className, 
        variant, 
        size, 
        asChild = false, 
        loading = false,
        leftIcon,
        rightIcon,
        children,
        disabled,
        ...props 
    }, ref) => {
        const Comp = asChild ? Slot : motion.button
        const isDisabled = disabled || loading
        
        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                disabled={isDisabled}
                whileTap={!isDisabled ? { scale: 0.98 } : undefined}
                whileHover={!isDisabled ? { scale: 1.02 } : undefined}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                {...props}
            >
                {loading && (
                    <motion.div
                        className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.15 }}
                    />
                )}
                {!loading && leftIcon && (
                    <span className="mr-2 flex items-center">
                        {leftIcon}
                    </span>
                )}
                <span className="flex items-center">
                    {children}
                </span>
                {!loading && rightIcon && (
                    <span className="ml-2 flex items-center">
                        {rightIcon}
                    </span>
                )}
            </Comp>
        )
    }
)
Button.displayName = "Button"

export { Button, buttonVariants }
