import { cn } from '@/lib/cn'
import React from 'react'

type GridProps = {
  children: React.ReactNode
  className?: string
}

export const Grid = ({ children, className }: GridProps) => {
  return <div className={cn('grid', className)}>{children}</div>
}
