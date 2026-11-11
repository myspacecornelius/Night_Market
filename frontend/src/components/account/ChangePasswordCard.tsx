import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { apiClient } from '@/lib/api-client'
import { changePasswordSchema, type ChangePasswordFormData } from '@/lib/validations/auth'

const errorMessage = (error: unknown): string => {
  const response = (error as { response?: { status?: number; data?: { detail?: unknown } } } | null)?.response
  if (typeof response?.data?.detail === 'string') return response.data.detail
  if (response?.status === 429) return 'Too many attempts. Try again in a few minutes.'
  return "Couldn't change the password. Try again."
}

/** Change the signed-in user's password. The server signs their other sessions out. */
export const ChangePasswordCard = () => {
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const form = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmNewPassword: '' },
  })

  const onSubmit = async (values: ChangePasswordFormData) => {
    setStatus(null)
    try {
      const result = await apiClient.changePassword(values.currentPassword, values.newPassword)
      const others = result.other_sessions_ended
      setStatus({
        kind: 'success',
        text:
          others > 0
            ? `Password changed. Signed out of ${others} other ${others === 1 ? 'session' : 'sessions'}.`
            : 'Password changed.',
      })
      form.reset()
    } catch (error) {
      setStatus({ kind: 'error', text: errorMessage(error) })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>Changing it signs you out everywhere except here.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="current-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormDescription>
                    At least 12 characters, with an uppercase letter, a number and a symbol.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmNewPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm new password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {status && (
              <p
                role={status.kind === 'error' ? 'alert' : 'status'}
                className={status.kind === 'error' ? 'text-sm text-destructive' : 'text-sm text-green-600'}
              >
                {status.text}
              </p>
            )}
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Changing…' : 'Change password'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

export default ChangePasswordCard
