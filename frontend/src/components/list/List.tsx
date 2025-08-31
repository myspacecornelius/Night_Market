import { cn } from '@/lib/cn'
import React from 'react'

type ListProps<T> = {
  items: T[]
  renderItem: (item: T) => React.ReactNode
  className?: string
}

export const List = <T,>({ items, renderItem, className }: ListProps<T>) => {
  return <div className={cn('grid gap-4', className)}>{items.map(renderItem)}</div>
}
