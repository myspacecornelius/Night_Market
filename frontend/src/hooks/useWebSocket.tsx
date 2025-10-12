import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { useAuth } from './useAuth'

export interface WebSocketMessage {
  type: 'signal_created' | 'signal_updated' | 'user_joined' | 'notification' | 'ping' | 'pong'
  data?: any
  timestamp?: number
}

interface WebSocketContextType {
  isConnected: boolean
  isConnecting: boolean
  lastMessage: WebSocketMessage | null
  sendMessage: (message: WebSocketMessage) => void
  subscribe: (type: string, callback: (data: any) => void) => () => void
  reconnect: () => void
}

const WebSocketContext = createContext<WebSocketContextType | null>(null)

interface WebSocketProviderProps {
  children: React.ReactNode
  url?: string
}

export const WebSocketProvider = ({ 
  children, 
  url = 'ws://localhost:8000/ws' 
}: WebSocketProviderProps) => {
  const { user, isAuthenticated } = useAuth()
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null)
  
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const subscribersRef = useRef<Map<string, Set<(data: any) => void>>>(new Map())
  const reconnectAttemptsRef = useRef(0)
  const maxReconnectAttempts = 5
  const reconnectDelay = 1000 // Start with 1 second

  const connect = useCallback(() => {
    if (!isAuthenticated || isConnecting || isConnected) return

    setIsConnecting(true)
    
    try {
      // Add auth token to WebSocket URL if available
      const token = localStorage.getItem('auth_token')
      const wsUrl = token ? `${url}?token=${token}` : url
      
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setIsConnected(true)
        setIsConnecting(false)
        reconnectAttemptsRef.current = 0
        
        console.log('🔗 WebSocket connected')
        
        // Send initial ping
        ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }))
      }

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          setLastMessage(message)
          
          // Handle specific message types
          switch (message.type) {
            case 'ping':
              // Respond to ping with pong
              ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }))
              break
              
            case 'notification':
              // Show toast notification
              if (message.data?.message) {
                toast.info(message.data.message, {
                  description: message.data.description
                })
              }
              break
              
            case 'signal_created':
              console.log('📡 New signal:', message.data)
              break
              
            case 'user_joined':
              console.log('👋 User joined:', message.data)
              break
          }
          
          // Notify subscribers
          const subscribers = subscribersRef.current.get(message.type)
          if (subscribers) {
            subscribers.forEach(callback => callback(message.data))
          }
          
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      ws.onclose = (event) => {
        setIsConnected(false)
        setIsConnecting(false)
        wsRef.current = null
        
        console.log('📡 WebSocket disconnected', event.code, event.reason)
        
        // Attempt to reconnect if not a normal closure
        if (event.code !== 1000 && isAuthenticated && reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = reconnectDelay * Math.pow(2, reconnectAttemptsRef.current)
          console.log(`🔄 Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`)
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++
            connect()
          }, delay)
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          toast.error('Connection lost', {
            description: 'Unable to reconnect to real-time updates. Please refresh the page.',
            action: {
              label: 'Refresh',
              onClick: () => window.location.reload()
            }
          })
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        setIsConnecting(false)
        
        if (!isConnected) {
          toast.error('Connection failed', {
            description: 'Failed to connect to real-time updates.'
          })
        }
      }

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error)
      setIsConnecting(false)
    }
  }, [url, isAuthenticated, isConnecting, isConnected])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'Component unmounting')
      wsRef.current = null
    }
    
    setIsConnected(false)
    setIsConnecting(false)
  }, [])

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current && isConnected) {
      try {
        wsRef.current.send(JSON.stringify({
          ...message,
          timestamp: Date.now()
        }))
      } catch (error) {
        console.error('Failed to send WebSocket message:', error)
        toast.error('Failed to send message')
      }
    } else {
      console.warn('Cannot send message: WebSocket not connected')
    }
  }, [isConnected])

  const subscribe = useCallback((type: string, callback: (data: any) => void) => {
    if (!subscribersRef.current.has(type)) {
      subscribersRef.current.set(type, new Set())
    }
    
    subscribersRef.current.get(type)!.add(callback)
    
    // Return unsubscribe function
    return () => {
      const subscribers = subscribersRef.current.get(type)
      if (subscribers) {
        subscribers.delete(callback)
        if (subscribers.size === 0) {
          subscribersRef.current.delete(type)
        }
      }
    }
  }, [])

  const reconnect = useCallback(() => {
    disconnect()
    reconnectAttemptsRef.current = 0
    setTimeout(connect, 100)
  }, [connect, disconnect])

  // Connect when authenticated, disconnect when not
  useEffect(() => {
    if (isAuthenticated) {
      connect()
    } else {
      disconnect()
    }

    return disconnect
  }, [isAuthenticated, connect, disconnect])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  // Keep-alive ping every 30 seconds
  useEffect(() => {
    if (!isConnected) return

    const pingInterval = setInterval(() => {
      sendMessage({ type: 'ping' })
    }, 30000)

    return () => clearInterval(pingInterval)
  }, [isConnected, sendMessage])

  const value: WebSocketContextType = {
    isConnected,
    isConnecting,
    lastMessage,
    sendMessage,
    subscribe,
    reconnect
  }

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  )
}

export const useWebSocket = () => {
  const context = useContext(WebSocketContext)
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider')
  }
  return context
}

// Hook for subscribing to specific message types
export const useWebSocketSubscription = (
  messageType: string, 
  callback: (data: any) => void,
  deps: React.DependencyList = []
) => {
  const { subscribe } = useWebSocket()
  
  useEffect(() => {
    const unsubscribe = subscribe(messageType, callback)
    return unsubscribe
  }, [messageType, subscribe, ...deps])
}

// Hook for real-time notifications
export const useRealtimeNotifications = () => {
  const [notifications, setNotifications] = useState<any[]>([])
  
  useWebSocketSubscription('notification', (data) => {
    setNotifications(prev => [data, ...prev].slice(0, 50)) // Keep last 50
  })
  
  return {
    notifications,
    clearNotifications: () => setNotifications([])
  }
}