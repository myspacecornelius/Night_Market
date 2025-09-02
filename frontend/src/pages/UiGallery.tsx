import React from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { designTokens } from '@/lib/design-tokens'

const VariantRow = () => (
  <div className="flex flex-wrap gap-3">
    <Button variant="default">Default</Button>
    <Button variant="secondary">Secondary</Button>
    <Button variant="outline">Outline</Button>
    <Button variant="ghost">Ghost</Button>
    <Button variant="destructive">Destructive</Button>
    <Button variant="heat">Heat</Button>
    <Button variant="neon">Neon</Button>
    <Button variant="glass">Glass</Button>
  </div>
)

const SizeRow = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button size="sm">Small</Button>
    <Button>Default</Button>
    <Button size="lg">Large</Button>
    <Button size="xl">XL</Button>
    <Button size="icon" aria-label="Icon" className="rounded-full">🔥</Button>
  </div>
)

const ColorSwatches = () => (
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
    {Object.entries(designTokens.colors).map(([name, hex]) => (
      <div key={name} className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-md border" style={{ background: String(hex) }} />
        <div className="text-sm">
          <div className="font-medium">{name}</div>
          <div className="text-muted-foreground">{String(hex)}</div>
        </div>
      </div>
    ))}
  </div>
)

const UiGallery: React.FC = () => {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">UI Gallery</h1>

      <Card>
        <CardHeader>
          <CardTitle>Buttons — Variants</CardTitle>
        </CardHeader>
        <CardContent>
          <VariantRow />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Buttons — Sizes</CardTitle>
        </CardHeader>
        <CardContent>
          <SizeRow />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Design Tokens — Colors</CardTitle>
        </CardHeader>
        <CardContent>
          <ColorSwatches />
        </CardContent>
      </Card>
    </div>
  )
}

export default UiGallery
