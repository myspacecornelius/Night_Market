import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { WebSocketManager, WebSocketMessage, WebSocketContextType } from '../lib/websocket';

const WebSocketContext = createContext<WebSocketContextType | null>(null);

interface WebSocketProviderProps {
  children: React.ReactNode;
  url?: string;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ 
  children, 
  url = 'ws://localhost:8000/ws' 
}) => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const managerRef = useRef<WebSocketManager | null>(null);
  const subscribersRef = useRef<Map<string, Set<(data: any) => void>>>(new Map());

  useEffect(() => {
    // Get auth token from localStorage or context
    const token = localStorage.getItem('auth_token') || 'dev-token';
    
    // Initialize WebSocket manager
    managerRef.current = new WebSocketManager(url, token);
    
    managerRef.current.setConnectionChangeHandler(setIsConnected);
    managerRef.current.setMessageHandler(setLastMessage);
    
    // Connect
    managerRef.current.connect();

    // Cleanup on unmount
    return () => {
      managerRef.current?.disconnect();
    };
  }, [url]);

  const sendMessage = (message: any) => {
    managerRef.current?.sendMessage(message);
  };

  const subscribe = (type: string, callback: (data: any) => void) => {
    return managerRef.current?.subscribe(type, callback) || (() => {});
  };

  const contextValue: WebSocketContextType = {
    socket,
    isConnected,
    lastMessage,
    sendMessage,
    subscribe,
  };

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within WebSocketProvider');
  }
  return context;
};

// Custom hooks for specific features
export const useHeatMapUpdates = (callback: (event: any) => void) => {
  const { subscribe } = useWebSocket();
  
  useEffect(() => {
    const unsubscribe = subscribe('heatmap_updates', callback);
    return unsubscribe;
  }, [subscribe, callback]);
};

export const useLacesUpdates = (callback: (transaction: any) => void) => {
  const { subscribe } = useWebSocket();
  
  useEffect(() => {
    const unsubscribe = subscribe('laces_transaction', callback);
    return unsubscribe;
  }, [subscribe, callback]);
};

export const useTaskUpdates = (callback: (task: any) => void) => {
  const { subscribe } = useWebSocket();
  
  useEffect(() => {
    const unsubscribe = subscribe('task_updates', callback);
    return unsubscribe;
  }, [subscribe, callback]);
};

export const useSystemAlerts = (callback: (alert: any) => void) => {
  const { subscribe } = useWebSocket();
  
  useEffect(() => {
    const unsubscribe = subscribe('system_alerts', callback);
    return unsubscribe;
  }, [subscribe, callback]);
};