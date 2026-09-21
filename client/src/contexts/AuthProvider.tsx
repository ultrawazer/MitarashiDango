import React, { useState, useEffect, useCallback } from 'react'
import { AuthContext, type UserProfile } from './AuthContext'

const TOKEN_KEY = 'dango_auth_token'

function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function setStoredToken(token: string, rememberMe: boolean): void {
  try {
    if (rememberMe) {
      localStorage.setItem(TOKEN_KEY, token)
      sessionStorage.removeItem(TOKEN_KEY)
    } else {
      sessionStorage.setItem(TOKEN_KEY, token)
      localStorage.removeItem(TOKEN_KEY)
    }
  } catch {}
}

function clearStoredToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {}
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [isSetup, setIsSetup] = useState<boolean>(true)
  const [hasLegacyData, setHasLegacyData] = useState<boolean>(false)
  const [registrationEnabled, setRegistrationEnabled] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(true)

  const refreshUser = useCallback(async () => {
    try {
      const token = getStoredToken()
      const headers: Record<string, string> = {}
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
      const res = await fetch('/api/auth/me', { headers })
      if (res.ok) {
        const data = await res.json()
        setUser(data)
      } else {
        setUser(null)
        clearStoredToken()
      }
    } catch {
      setUser(null)
    }
  }, [])

  const checkStatusAndAuth = useCallback(async () => {
    setIsLoading(true)
    try {
      const statusRes = await fetch('/api/auth/status')
      if (statusRes.ok) {
        const statusData = await statusRes.json()
        setIsSetup(statusData.isSetup)
        setHasLegacyData(statusData.hasLegacyData)
        setRegistrationEnabled(statusData.registrationEnabled)

        if (statusData.isSetup) {
          await refreshUser()
        } else {
          setUser(null)
        }
      }
    } catch {
      // Network error or server not ready
    } finally {
      setIsLoading(false)
    }
  }, [refreshUser])

  useEffect(() => {
    checkStatusAndAuth()
  }, [checkStatusAndAuth])

  const login = useCallback(
    async (
      username: string,
      password: string,
      rememberMe: boolean = true
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, rememberMe }),
        })
        const data = await res.json()
        if (res.ok && data.success) {
          setUser(data.user)
          if (data.token) {
            setStoredToken(data.token, rememberMe)
          }
          return { success: true }
        }
        return { success: false, error: data.error || 'Invalid credentials' }
      } catch {
        return { success: false, error: 'Network error during login' }
      }
    },
    []
  )

  const setup = useCallback(
    async (
      username: string,
      displayName: string,
      password: string
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await fetch('/api/auth/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, displayName, password }),
        })
        const data = await res.json()
        if (res.ok && data.success) {
          setUser(data.user)
          if (data.token) {
            setStoredToken(data.token, true)
          }
          setIsSetup(true)
          setHasLegacyData(false)
          return { success: true }
        }
        return { success: false, error: data.error || 'Failed to complete setup' }
      } catch {
        return { success: false, error: 'Network error during setup' }
      }
    },
    []
  )

  const logout = useCallback(async () => {
    try {
      const token = getStoredToken()
      const headers: Record<string, string> = {}
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
      await fetch('/api/auth/logout', { method: 'POST', headers })
    } catch {}
    clearStoredToken()
    setUser(null)
  }, [])

  const value = {
    user,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isSetup,
    isLoading,
    hasLegacyData,
    registrationEnabled,
    login,
    setup,
    logout,
    refreshUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
