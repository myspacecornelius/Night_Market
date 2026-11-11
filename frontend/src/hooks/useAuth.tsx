import React, { createContext, useContext, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { apiClient } from '@/lib/api-client'
import { getAccessToken } from '@/lib/auth-tokens'
import type { User } from '@/lib/api-client'
import { type LoginFormData, type RegisterFormData } from '@/lib/validations/auth'

/** What creating an account needs; the sign-up form collects more (the confirmation). */
export type RegistrationDetails = Pick<RegisterFormData, 'username' | 'email' | 'password' | 'displayName'>

export interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (data: LoginFormData) => Promise<void>
  register: (data: RegistrationDetails) => Promise<void>
  logout: (options?: { silent?: boolean }) => void
  refreshUser: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType | null>(null)

interface AuthProviderProps {
  children: React.ReactNode
}

/** True when a request failed because the server no longer accepts the session. */
const isUnauthorized = (error: unknown): boolean =>
  (error as { response?: { status?: number } } | null)?.response?.status === 401

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const queryClient = useQueryClient()
  // Read the stored token synchronously: starting as "signed out" and flipping in
  // an effect sent every page reload to the login screen first.
  const [isAuthenticated, setIsAuthenticated] = useState(() => getAccessToken() !== null)

  // Fetch current user data
  const { 
    data: user, 
    isLoading: userLoading,
    error: userError,
    refetch: refetchUser 
  } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => apiClient.getCurrentUser(),
    enabled: isAuthenticated,
    // A 401 is final (the API client has already tried to renew the session).
    // Anything else is the API restarting, a 5xx, a 429 or a dropped connection:
    // worth another try, and never a reason to throw the session away.
    retry: (failureCount, error) => !isUnauthorized(error) && failureCount < 3,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Only a 401 ends the session. Signing out on every failed profile request
  // deleted both tokens whenever the API was briefly unreachable.
  useEffect(() => {
    if (isUnauthorized(userError)) {
      apiClient.logout()
      setIsAuthenticated(false)
      queryClient.removeQueries({ queryKey: ['currentUser'] })
    }
  }, [userError, queryClient])

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      try {
        const tokens = await apiClient.login(data.email, data.password)
        return tokens
      } catch (error: any) {
        if (error.response?.status === 401) {
          throw new Error('Invalid email or password')
        } else if (error.response?.status === 429) {
          throw new Error('Too many login attempts. Please try again later.')
        } else if (error.response?.data?.detail) {
          throw new Error(error.response.data.detail)
        } else {
          throw new Error('Login failed. Please try again.')
        }
      }
    },
    onSuccess: () => {
      setIsAuthenticated(true)
      queryClient.invalidateQueries({ queryKey: ['currentUser'] })
      toast.success('Welcome back! 🔥')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    }
  })

  // Register mutation
  const registerMutation = useMutation({
    mutationFn: async (data: RegistrationDetails) => {
      try {
        return await apiClient.register({
          username: data.username,
          email: data.email,
          password: data.password,
          display_name: data.displayName
        })
      } catch (error: any) {
        if (error.response?.status === 409) {
          // the API says which one is taken
          const detail = error.response?.data?.detail
          throw new Error(typeof detail === 'string' ? detail : 'Username or email already exists')
        } else if (error.response?.status === 429) {
          throw new Error('Too many sign-up attempts. Please try again later.')
        } else if (typeof error.response?.data?.detail === 'string') {
          throw new Error(error.response.data.detail)
        } else {
          throw new Error('Registration failed. Please try again.')
        }
      }
    },
    onSuccess: () => {
      toast.success('Account created')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    }
  })

  const login = async (data: LoginFormData) => {
    await loginMutation.mutateAsync(data)
  }

  const register = async (data: RegistrationDetails) => {
    await registerMutation.mutateAsync(data)
  }

  const logout = (options?: { silent?: boolean }) => {
    apiClient.logout()
    setIsAuthenticated(false)
    queryClient.clear()
    if (!options?.silent) {
      toast.success('Logged out successfully')
    }
  }

  const refreshUser = async () => {
    await refetchUser()
  }

  const isUserLoading = isAuthenticated && userLoading

  const value: AuthContextType = {
    user: user || null,
    isAuthenticated,
    isLoading: isUserLoading || loginMutation.isPending || registerMutation.isPending,
    login,
    register,
    logout,
    refreshUser
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

const defaultAuthContextValue: AuthContextType = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  login: async () => {},
  register: async () => {},
  logout: () => {},
  refreshUser: async () => {},
}

export const MockAuthProvider = ({
  children,
  value,
}: {
  children: React.ReactNode
  value?: Partial<AuthContextType>
}) => {
  return (
    <AuthContext.Provider value={{ ...defaultAuthContextValue, ...value }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// Hook for protected routes
export const useRequireAuth = () => {
  const { isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login', { replace: true })
    }
  }, [isAuthenticated, isLoading, navigate])

  return { isAuthenticated, isLoading }
}
