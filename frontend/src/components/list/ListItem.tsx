import { cn } from '@/lib/cn'
import React from 'react'

type ListItemProps = {
  children: React.ReactNode
  className?: string
}

export const ListItem = ({ children, className }: ListItemProps) => {
  return <div className={cn('rounded-lg border bg-card p-4', className)}>{children}</div>
}
