import { cn } from '@/lib/cn'
import React from 'react'

type EmptyStateProps = {
  title: string
  description: string
  className?: string
}

export const EmptyState = ({ title, description, className }: EmptyStateProps) => {
  return (
    <div className={cn('rounded-lg border bg-card p-8 text-center', className)}>
      <h3 className="text-lg font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
