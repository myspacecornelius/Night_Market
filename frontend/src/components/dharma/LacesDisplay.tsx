import * as React from "react"
import { motion } from "framer-motion"
import { Flame, TrendingUp, TrendingDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface LacesDisplayProps {
  amount: number
  change?: number
  size?: "sm" | "md" | "lg"
  showChange?: boolean
  animated?: boolean
  className?: string
}

export function LacesDisplay({ 
  amount, 
  change, 
  size = "md", 
  showChange = false,
  animated = true,
  className 
}: LacesDisplayProps) {
  const sizeClasses = {
    sm: "text-sm",
    md: "text-base", 
    lg: "text-lg"
  }
  
  const iconSizes = {
    sm: 14,
    md: 16,
    lg: 20
  }
  
  const isPositiveChange = change && change > 0
  const isNegativeChange = change && change < 0
  
  return (
    <motion.div 
      className={cn(
        "inline-flex items-center gap-1.5 font-grotesk font-semibold",
        sizeClasses[size],
        className
      )}
      initial={animated ? { scale: 0.9, opacity: 0 } : undefined}
      animate={animated ? { scale: 1, opacity: 1 } : undefined}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
    >
      <Flame 
        size={iconSizes[size]} 
        className="text-heat animate-pulse" 
      />
      <span className="text-foreground">
        {amount.toLocaleString()}
      </span>
      <span className="text-muted-foreground text-xs uppercase tracking-wider">
        LACES
      </span>
      
      {showChange && change !== undefined && (
        <motion.div
          className={cn(
            "flex items-center gap-0.5 text-xs",
            isPositiveChange && "text-neon",
            isNegativeChange && "text-heat"
          )}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
        >
          {isPositiveChange && <TrendingUp size={12} />}
          {isNegativeChange && <TrendingDown size={12} />}
          <span>
            {change > 0 ? "+" : ""}{change}
          </span>
        </motion.div>
      )}
    </motion.div>
  )
}

// Specialized variants
export function LacesBalance({ amount, className }: { amount: number; className?: string }) {
  return (
    <LacesDisplay 
      amount={amount} 
      size="lg" 
      className={cn("text-foreground", className)}
    />
  )
}

export function LacesTransaction({ 
  amount, 
  type 
}: { 
  amount: number; 
  type: "earned" | "spent" 
}) {
  return (
    <LacesDisplay 
      amount={Math.abs(amount)} 
      change={type === "earned" ? amount : -amount}
      showChange={true}
      size="sm"
      className={cn(
        type === "earned" ? "text-neon" : "text-heat"
      )}
    />
  )
}
