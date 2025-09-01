import * as React from "react"
import { cn } from "@/lib/utils"

interface SliderProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number[]
  onValueChange: (value: number[]) => void
  max?: number
  min?: number
  step?: number
  disabled?: boolean
}

const Slider = React.forwardRef<HTMLDivElement, SliderProps>(
  ({ className, value, onValueChange, max = 100, min = 0, step = 1, disabled, ...props }, ref) => {
    const [dragging, setDragging] = React.useState(false)
    const sliderRef = React.useRef<HTMLDivElement>(null)

    const handleMouseDown = React.useCallback(
      (e: React.MouseEvent) => {
        if (disabled) return
        setDragging(true)
        updateValue(e)
      },
      [disabled]
    )

    const updateValue = React.useCallback(
      (e: React.MouseEvent | MouseEvent) => {
        if (!sliderRef.current) return
        
        const rect = sliderRef.current.getBoundingClientRect()
        const percentage = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
        const newValue = Math.round((min + percentage * (max - min)) / step) * step
        onValueChange([newValue])
      },
      [min, max, step, onValueChange]
    )

    React.useEffect(() => {
      if (!dragging) return

      const handleMouseMove = (e: MouseEvent) => updateValue(e)
      const handleMouseUp = () => setDragging(false)

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }, [dragging, updateValue])

    const percentage = ((value[0] - min) / (max - min)) * 100

    return (
      <div
        ref={ref}
        className={cn(
          "relative flex w-full touch-none select-none items-center cursor-pointer",
          disabled && "pointer-events-none opacity-50",
          className
        )}
        onMouseDown={handleMouseDown}
        {...props}
      >
        <div
          ref={sliderRef}
          className="relative h-2 w-full grow overflow-hidden rounded-full bg-earth-200 dark:bg-earth-700"
        >
          <div
            className="absolute h-full bg-gradient-to-r from-earth-500 to-sage-500 transition-all duration-200"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div
          className="block h-4 w-4 rounded-full border-2 border-earth-500 bg-white shadow-md ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-earth-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:border-earth-400 dark:bg-earth-800 dark:ring-offset-earth-800 dark:focus-visible:ring-earth-400"
          style={{ 
            marginLeft: `calc(${percentage}% - 8px)`,
            position: 'absolute',
            left: 0,
            top: '50%',
            transform: 'translateY(-50%)'
          }}
        />
      </div>
    )
  }
)
Slider.displayName = "Slider"

export { Slider }