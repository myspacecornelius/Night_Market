import { cn } from '@/lib/cn'
import React from 'react'

type StackProps = {
  children: React.ReactNode
  className?: string
}

export const Stack = ({ children, className }: StackProps) => {
  return <div className={cn('flex', className)}>{children}</div>
}
