import { FormProvider, useForm, type UseFormProps, type UseFormReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import React from 'react'

type FormProps<T extends z.ZodType<any, any>> = {
  children: (methods: UseFormReturn<z.infer<T>>) => React.ReactNode
  onSubmit: (values: z.infer<T>) => void
  schema: T
  formProps?: UseFormProps<z.infer<T>>
}

export const Form = <T extends z.ZodType<any, any>>({
  children,
  onSubmit,
  schema,
  formProps,
}: FormProps<T>) => {
  const methods = useForm<z.infer<T>>({
    ...formProps,
    resolver: zodResolver(schema),
  })

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit(onSubmit)}>{children(methods)}</form>
    </FormProvider>
  )
}
