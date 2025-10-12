import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

interface FormFieldProps {
  label?: string
  type?: 'text' | 'email' | 'password' | 'tel' | 'url'
  placeholder?: string
  value: string
  onChange: (value: string) => void
  error?: string
  success?: string
  hint?: string
  required?: boolean
  disabled?: boolean
  className?: string
  inputClassName?: string
  showPasswordToggle?: boolean
  autoComplete?: string
  autoFocus?: boolean
}

export const FormField = ({
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  error,
  success,
  hint,
  required = false,
  disabled = false,
  className,
  inputClassName,
  showPasswordToggle = false,
  autoComplete,
  autoFocus = false
}: FormFieldProps) => {
  const [showPassword, setShowPassword] = React.useState(false)
  const [isFocused, setIsFocused] = React.useState(false)
  
  const inputType = type === 'password' && showPassword ? 'text' : type
  const hasError = Boolean(error)
  const hasSuccess = Boolean(success) && !hasError
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn('space-y-2', className)}
    >
      {label && (
        <Label 
          htmlFor={label}
          className={cn(
            'text-sm font-medium transition-colors',
            hasError && 'text-destructive',
            hasSuccess && 'text-green-600'
          )}
        >
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
      )}
      
      <div className="relative">
        <Input
          id={label}
          type={inputType}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={disabled}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          className={cn(
            'transition-all duration-200',
            hasError && 'border-destructive focus-visible:ring-destructive',
            hasSuccess && 'border-green-500 focus-visible:ring-green-500',
            isFocused && 'ring-2',
            showPasswordToggle && 'pr-12',
            inputClassName
          )}
        />
        
        {/* Password Toggle */}
        {showPasswordToggle && type === 'password' && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
            onClick={() => setShowPassword(!showPassword)}
            tabIndex={-1}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Eye className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        )}
        
        {/* Status Icons */}
        {(hasError || hasSuccess) && !showPasswordToggle && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {hasError && (
              <AlertCircle className="h-4 w-4 text-destructive" />
            )}
            {hasSuccess && (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            )}
          </div>
        )}
        
        {/* Focus Ring Animation */}
        <AnimatePresence>
          {isFocused && !hasError && !hasSuccess && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="absolute inset-0 ring-2 ring-primary rounded-md pointer-events-none"
            />
          )}
        </AnimatePresence>
      </div>
      
      {/* Messages */}
      <AnimatePresence mode="wait">
        {error && (
          <motion.div
            key="error"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-1.5 text-sm text-destructive"
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}
        
        {success && !error && (
          <motion.div
            key="success"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-1.5 text-sm text-green-600"
          >
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span>{success}</span>
          </motion.div>
        )}
        
        {hint && !error && !success && (
          <motion.div
            key="hint"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="text-sm text-muted-foreground"
          >
            {hint}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}