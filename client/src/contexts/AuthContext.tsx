import { createContext, useContext } from 'react'

export interface UserProfile {
  id: string
  username: string
  displayName: string
  role: 'admin' | 'user'
  avatarUrl: string | null
}

export interface AuthContextType {
  user: UserProfile | null
  isAuthenticated: boolean
  isAdmin: boolean
  isSetup: boolean
  isLoading: boolean
  hasLegacyData: boolean
  registrationEnabled: boolean
  login: (username: string, password: string, rememberMe?: boolean) => Promise<{ success: boolean; error?: string }>
  setup: (username: string, displayName: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
