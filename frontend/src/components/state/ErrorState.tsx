import { cn } from '@/lib/cn'
import { AlertTriangle } from 'lucide-react'
import React from 'react'

type ErrorStateProps = {
  title: string
  description: string
  className?: string
}

export const ErrorState = ({ title, description, className }: ErrorStateProps) => {
  return (
    <div className={cn('rounded-lg border bg-card p-8 text-center', className)}>
      <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
      <h3 className="mt-4 text-lg font-medium">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
