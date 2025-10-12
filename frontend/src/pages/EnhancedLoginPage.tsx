import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { 
  ArrowLeft, 
  Lock, 
  Mail, 
  User, 
  Loader2, 
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Zap
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/Button'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { FormField } from '@/components/forms/FormField'
import { useAuth } from '@/hooks/useAuth'
import { loginSchema, registerSchema, getPasswordStrength, type LoginFormData, type RegisterFormData } from '@/lib/validations/auth'
import { cn } from '@/lib/cn'

type AuthMode = 'login' | 'register' | 'forgot-password'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: {
      type: "spring",
      damping: 20,
      stiffness: 300
    }
  }
}

export default function EnhancedLoginPage() {
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const { login, register, isLoading } = useAuth()

  // Login form
  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: ''
    }
  })

  // Register form
  const registerForm = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
      displayName: '',
      acceptTerms: false
    }
  })

  const currentForm = authMode === 'login' ? loginForm : registerForm
  const passwordValue = registerForm.watch('password')
  const passwordStrength = authMode === 'register' ? getPasswordStrength(passwordValue || '') : null

  const onLoginSubmit = async (data: LoginFormData) => {
    try {
      await login(data)
    } catch (error) {
      // Error handling is done in the useAuth hook
    }
  }

  const onRegisterSubmit = async (data: RegisterFormData) => {
    try {
      await register(data)
    } catch (error) {
      // Error handling is done in the useAuth hook
    }
  }

  const switchMode = (mode: AuthMode) => {
    setAuthMode(mode)
    loginForm.reset()
    registerForm.reset()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background/95 to-muted/50 flex items-center justify-center p-4">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full max-w-md"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Zap className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">
            {authMode === 'login' && 'Welcome Back'}
            {authMode === 'register' && 'Join Dharma'}
            {authMode === 'forgot-password' && 'Reset Password'}
          </h1>
          <p className="text-muted-foreground mt-2">
            {authMode === 'login' && 'Enter the underground network'}
            {authMode === 'register' && 'Start your sneaker journey'}
            {authMode === 'forgot-password' && 'Recover your account'}
          </p>
        </motion.div>

        {/* Main Card */}
        <motion.div variants={itemVariants}>
          <Card className="border-border/50 bg-card/80 backdrop-blur-sm shadow-xl">
            <CardHeader className="space-y-1">
              <div className="flex items-center gap-2">
                {authMode !== 'login' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => switchMode('login')}
                    className="p-2"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                )}
                <CardTitle className="text-xl">
                  {authMode === 'login' && 'Sign In'}
                  {authMode === 'register' && 'Create Account'}
                  {authMode === 'forgot-password' && 'Forgot Password'}
                </CardTitle>
              </div>
              <CardDescription>
                {authMode === 'login' && 'Sign in to your account to continue'}
                {authMode === 'register' && 'Create your account to get started'}
                {authMode === 'forgot-password' && 'Enter your email to reset your password'}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <AnimatePresence mode="wait">
                {/* Login Form */}
                {authMode === 'login' && (
                  <motion.form
                    key="login"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    onSubmit={loginForm.handleSubmit(onLoginSubmit)}
                    className="space-y-4"
                  >
                    <FormField
                      label="Email"
                      type="email"
                      placeholder="Enter your email"
                      value={loginForm.watch('email')}
                      onChange={(value) => loginForm.setValue('email', value)}
                      error={loginForm.formState.errors.email?.message}
                      autoComplete="email"
                      autoFocus
                    />

                    <FormField
                      label="Password"
                      type="password"
                      placeholder="Enter your password"
                      value={loginForm.watch('password')}
                      onChange={(value) => loginForm.setValue('password', value)}
                      error={loginForm.formState.errors.password?.message}
                      showPasswordToggle
                      autoComplete="current-password"
                    />

                    <div className="flex items-center justify-between text-sm">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" className="rounded" />
                        <span className="text-muted-foreground">Remember me</span>
                      </label>
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        onClick={() => switchMode('forgot-password')}
                        className="px-0 h-auto"
                      >
                        Forgot password?
                      </Button>
                    </div>

                    <Button
                      type="submit"
                      className="w-full"
                      size="lg"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Signing in...
                        </>
                      ) : (
                        <>
                          <Lock className="mr-2 h-4 w-4" />
                          Sign In
                        </>
                      )}
                    </Button>
                  </motion.form>
                )}

                {/* Register Form */}
                {authMode === 'register' && (
                  <motion.form
                    key="register"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    onSubmit={registerForm.handleSubmit(onRegisterSubmit)}
                    className="space-y-4"
                  >
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        label="Username"
                        placeholder="username"
                        value={registerForm.watch('username')}
                        onChange={(value) => registerForm.setValue('username', value)}
                        error={registerForm.formState.errors.username?.message}
                        autoComplete="username"
                        autoFocus
                      />

                      <FormField
                        label="Display Name"
                        placeholder="Your Name"
                        value={registerForm.watch('displayName')}
                        onChange={(value) => registerForm.setValue('displayName', value)}
                        error={registerForm.formState.errors.displayName?.message}
                        autoComplete="name"
                      />
                    </div>

                    <FormField
                      label="Email"
                      type="email"
                      placeholder="Enter your email"
                      value={registerForm.watch('email')}
                      onChange={(value) => registerForm.setValue('email', value)}
                      error={registerForm.formState.errors.email?.message}
                      autoComplete="email"
                    />

                    <div className="space-y-2">
                      <FormField
                        label="Password"
                        type="password"
                        placeholder="Create a password"
                        value={registerForm.watch('password')}
                        onChange={(value) => registerForm.setValue('password', value)}
                        error={registerForm.formState.errors.password?.message}
                        showPasswordToggle
                        autoComplete="new-password"
                      />

                      {/* Password Strength Indicator */}
                      {passwordValue && passwordStrength && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="space-y-2"
                        >
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  'h-full transition-all duration-300',
                                  passwordStrength.strength === 'weak' && 'bg-red-500',
                                  passwordStrength.strength === 'fair' && 'bg-orange-500',
                                  passwordStrength.strength === 'good' && 'bg-yellow-500',
                                  passwordStrength.strength === 'strong' && 'bg-green-500'
                                )}
                                style={{ width: `${passwordStrength.percentage}%` }}
                              />
                            </div>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-xs',
                                passwordStrength.strength === 'weak' && 'text-red-600',
                                passwordStrength.strength === 'fair' && 'text-orange-600',
                                passwordStrength.strength === 'good' && 'text-yellow-600',
                                passwordStrength.strength === 'strong' && 'text-green-600'
                              )}
                            >
                              {passwordStrength.strength}
                            </Badge>
                          </div>
                        </motion.div>
                      )}
                    </div>

                    <FormField
                      label="Confirm Password"
                      type="password"
                      placeholder="Confirm your password"
                      value={registerForm.watch('confirmPassword')}
                      onChange={(value) => registerForm.setValue('confirmPassword', value)}
                      error={registerForm.formState.errors.confirmPassword?.message}
                      showPasswordToggle
                      autoComplete="new-password"
                    />

                    <div className="space-y-4">
                      <label className="flex items-start gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={registerForm.watch('acceptTerms')}
                          onChange={(e) => registerForm.setValue('acceptTerms', e.target.checked)}
                          className="mt-0.5 rounded"
                        />
                        <span className="text-muted-foreground">
                          I agree to the{' '}
                          <Link to="/terms" className="text-primary hover:underline">
                            Terms of Service
                          </Link>{' '}
                          and{' '}
                          <Link to="/privacy" className="text-primary hover:underline">
                            Privacy Policy
                          </Link>
                        </span>
                      </label>
                      {registerForm.formState.errors.acceptTerms && (
                        <p className="text-sm text-destructive">
                          {registerForm.formState.errors.acceptTerms.message}
                        </p>
                      )}
                    </div>

                    <Button
                      type="submit"
                      className="w-full"
                      size="lg"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating account...
                        </>
                      ) : (
                        <>
                          <User className="mr-2 h-4 w-4" />
                          Create Account
                        </>
                      )}
                    </Button>
                  </motion.form>
                )}
              </AnimatePresence>

              {/* Switch Mode */}
              {authMode !== 'forgot-password' && (
                <>
                  <Separator />
                  <div className="text-center text-sm">
                    <span className="text-muted-foreground">
                      {authMode === 'login' ? "Don't have an account?" : 'Already have an account?'}
                    </span>{' '}
                    <Button
                      variant="link"
                      onClick={() => switchMode(authMode === 'login' ? 'register' : 'login')}
                      className="px-0 h-auto font-medium"
                    >
                      {authMode === 'login' ? 'Sign up' : 'Sign in'}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Demo Notice */}
        <motion.div variants={itemVariants} className="mt-6">
          <Card className="bg-muted/50 border-muted">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Badge variant="secondary" className="mt-0.5">
                  Demo
                </Badge>
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium mb-1">Demo Environment</p>
                  <p>
                    For login, use any email and password. Registration is currently simulated.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  )
}