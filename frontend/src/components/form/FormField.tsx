import { useFormContext } from 'react-hook-form'
import { Input, type InputProps } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/cn'
import React from 'react'

type FormFieldProps = {
  name: string
  label: string
  type?: string
  inputProps?: InputProps
  className?: string
}

export const FormField = ({ name, label, type = 'text', inputProps, className }: FormFieldProps) => {
  const {
    register,
    formState: { errors },
  } = useFormContext()

  const error = errors[name]?.message

  return (
    <div className={cn('grid w-full max-w-sm items-center gap-1.5', className)}>
      <Label htmlFor={name}>{label}</Label>
      <Input {...register(name)} id={name} type={type} {...inputProps} />
      {typeof error === 'string' && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
