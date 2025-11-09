import { z } from 'zod'

// Common validation patterns
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(100, 'Password must be less than 100 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')

const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Please enter a valid email address')
  .max(254, 'Email must be less than 254 characters')

const usernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be less than 30 characters')
  .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
  .regex(/^[a-zA-Z]/, 'Username must start with a letter')

// Login form schema
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required')
})

// Register form schema
export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string().min(1, 'Please confirm your password'),
  displayName: z
    .string()
    .min(1, 'Display name is required')
    .max(50, 'Display name must be less than 50 characters')
    .trim(),
  acceptTerms: z.boolean().refine(val => val === true, {
    message: 'You must accept the terms and conditions'
  })
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword']
})

// Forgot password schema
export const forgotPasswordSchema = z.object({
  email: emailSchema
})

// Reset password schema
export const resetPasswordSchema = z.object({
  password: passwordSchema,
  confirmPassword: z.string().min(1, 'Please confirm your password'),
  token: z.string().min(1, 'Reset token is required')
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword']
})

// Profile update schema
export const profileUpdateSchema = z.object({
  username: usernameSchema.optional(),
  displayName: z
    .string()
    .max(50, 'Display name must be less than 50 characters')
    .trim()
    .optional(),
  bio: z
    .string()
    .max(160, 'Bio must be less than 160 characters')
    .optional(),
  location: z
    .string()
    .max(100, 'Location must be less than 100 characters')
    .optional()
})

// Change password schema
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
  confirmNewPassword: z.string().min(1, 'Please confirm your new password')
}).refine(data => data.newPassword === data.confirmNewPassword, {
  message: "Passwords don't match",
  path: ['confirmNewPassword']
}).refine(data => data.currentPassword !== data.newPassword, {
  message: "New password must be different from current password",
  path: ['newPassword']
})

// Infer types from schemas
type LoginFormDataType = z.infer<typeof loginSchema>
type RegisterFormDataType = z.infer<typeof registerSchema>
type ForgotPasswordFormDataType = z.infer<typeof forgotPasswordSchema>
type ResetPasswordFormDataType = z.infer<typeof resetPasswordSchema>
type ProfileUpdateFormDataType = z.infer<typeof profileUpdateSchema>
type ChangePasswordFormDataType = z.infer<typeof changePasswordSchema>

// Export types
export type LoginFormData = LoginFormDataType
export type RegisterFormData = RegisterFormDataType
export type ForgotPasswordFormData = ForgotPasswordFormDataType
export type ResetPasswordFormData = ResetPasswordFormDataType
export type ProfileUpdateFormData = ProfileUpdateFormDataType
export type ChangePasswordFormData = ChangePasswordFormDataType

// Password strength checker
export const getPasswordStrength = (password: string) => {
  let score = 0
  const checks = {
    length: password.length >= 8,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password)
  }

  score = Object.values(checks).filter(Boolean).length

  const strength = 
    score <= 2 ? 'weak' :
    score <= 3 ? 'fair' :
    score <= 4 ? 'good' :
    'strong'

  return {
    score,
    strength,
    checks,
    percentage: (score / 5) * 100
  }
}
