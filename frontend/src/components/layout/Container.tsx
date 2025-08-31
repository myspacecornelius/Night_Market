import { cn } from '@/lib/cn'
import React from 'react'

type ContainerProps = {
  children: React.ReactNode
  className?: string
}

export const Container = ({ children, className }: ContainerProps) => {
  return <div className={cn('container', className)}>{children}</div>
}
