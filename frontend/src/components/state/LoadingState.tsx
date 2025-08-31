import { cn } from '@/lib/cn'
import { Loader2 } from 'lucide-react'
import React from 'react'

type LoadingStateProps = {
  className?: string
}

export const LoadingState = ({ className }: LoadingStateProps) => {
  return (
    <div className={cn('flex items-center justify-center rounded-lg border bg-card p-8', className)}>
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  )
}
