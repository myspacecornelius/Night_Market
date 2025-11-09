import React, { createContext, useContext, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { apiClient } from '@/lib/api-client'
import type { User } from '@/lib/api-client'
import { LoginFormData, RegisterFormData } from '@/lib/validations/auth'

export interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (data: LoginFormData) => Promise<void>
  register: (data: RegisterFormData) => Promise<void>
  logout: (options?: { silent?: boolean }) => void
  refreshUser: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType | null>(null)

interface AuthProviderProps {
  children: React.ReactNode
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const queryClient = useQueryClient()
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  // Check if user is logged in on app start
  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    if (token) {
      setIsAuthenticated(true)
    }
  }, [])

  // Fetch current user data
  const { 
    data: user, 
    isLoading: userLoading,
    refetch: refetchUser 
  } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => apiClient.getCurrentUser(),
    enabled: isAuthenticated,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    onError: () => {
      // If fetching user fails, user is not authenticated
      logout({ silent: true })
    }
  })

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
    mutationFn: async (data: RegisterFormData) => {
      try {
        // Note: This endpoint would need to be implemented in the backend
        const response = await fetch('/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: data.username,
            email: data.email,
            password: data.password,
            display_name: data.displayName
          })
        })
        
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.detail || 'Registration failed')
        }
        
        return response.json()
      } catch (error: any) {
        if (error.response?.status === 409) {
          throw new Error('Username or email already exists')
        } else if (error.response?.data?.detail) {
          throw new Error(error.response.data.detail)
        } else {
          throw new Error('Registration failed. Please try again.')
        }
      }
    },
    onSuccess: () => {
      toast.success('Account created successfully! Please log in.')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    }
  })

  const login = async (data: LoginFormData) => {
    await loginMutation.mutateAsync(data)
  }

  const register = async (data: RegisterFormData) => {
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
