import React, { useState, useEffect, useCallback, useMemo } from 'react'
import type { Theme, CustomThemeInput } from '../types/theme'
import { PRESET_THEMES, ThemeContext } from './ThemeContext'
import { applyThemeToDocument, deriveThemeColors } from '../utils/themeUtils'
import { useSetting, useUpdateSetting } from '../hooks/useSettings'

const STORAGE_CUSTOM_THEMES_KEY = 'dango-custom-themes'
const STORAGE_USER_THEME_KEY = 'dango-user-theme'
const STORAGE_SERVER_THEME_KEY = 'dango-server-theme'

interface ThemeProviderProps {
  children: React.ReactNode
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const { data: userThemeSetting } = useSetting('activeTheme')
  const { data: serverThemeSetting } = useSetting('serverTheme')
  const updateSetting = useUpdateSetting({ silent: true })

  const [customThemes, setCustomThemes] = useState<Theme[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_CUSTOM_THEMES_KEY)
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (e) {
      console.error('Failed to load custom themes from localStorage', e)
    }
    return []
  })

  const [userThemeId, setUserThemeId] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_USER_THEME_KEY) || 'server-default'
    } catch {
      return 'server-default'
    }
  })

  const [serverThemeId, setServerThemeId] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_SERVER_THEME_KEY) || 'dango'
    } catch {
      return 'dango'
    }
  })

  const [isLoaded, setIsLoaded] = useState<boolean>(false)

  // Sync with user setting from DB
  useEffect(() => {
    if (typeof userThemeSetting === 'string' && userThemeSetting) {
      setUserThemeId(userThemeSetting)
      try {
        localStorage.setItem(STORAGE_USER_THEME_KEY, userThemeSetting)
      } catch {}
    }
  }, [userThemeSetting])

  // Sync with server setting from DB
  useEffect(() => {
    if (typeof serverThemeSetting === 'string' && serverThemeSetting) {
      setServerThemeId(serverThemeSetting)
      try {
        localStorage.setItem(STORAGE_SERVER_THEME_KEY, serverThemeSetting)
      } catch {}
    }
  }, [serverThemeSetting])

  const allThemes = useMemo(() => {
    return [...PRESET_THEMES, ...customThemes]
  }, [customThemes])

  // Effective active theme: userTheme takes priority unless set to 'server-default'
  const activeThemeId = useMemo(() => {
    if (userThemeId && userThemeId !== 'server-default') {
      return userThemeId
    }
    return serverThemeId || 'dango'
  }, [userThemeId, serverThemeId])

  const activeTheme = useMemo(() => {
    return allThemes.find((t) => t.id === activeThemeId) || PRESET_THEMES[0]
  }, [allThemes, activeThemeId])

  // Apply theme variables to document on active theme change
  useEffect(() => {
    applyThemeToDocument(activeTheme)
    setIsLoaded(true)
  }, [activeTheme])

  const setUserTheme = useCallback(
    (themeId: string) => {
      setUserThemeId(themeId)
      try {
        localStorage.setItem(STORAGE_USER_THEME_KEY, themeId)
      } catch {}
      updateSetting.mutate({ key: 'activeTheme', value: themeId })
    },
    [updateSetting]
  )

  const setServerTheme = useCallback(
    (themeId: string) => {
      setServerThemeId(themeId)
      try {
        localStorage.setItem(STORAGE_SERVER_THEME_KEY, themeId)
      } catch {}
      updateSetting.mutate({ key: 'serverTheme', value: themeId })
    },
    [updateSetting]
  )

  const setTheme = useCallback(
    (themeId: string) => {
      setUserTheme(themeId)
    },
    [setUserTheme]
  )

  const createTheme = useCallback(
    (input: CustomThemeInput): string => {
      const newTheme: Theme = {
        id: `custom-${Date.now()}`,
        name: input.name.trim() || 'Custom Theme',
        isPreset: false,
        mode: input.mode,
        colors: deriveThemeColors(input),
      }

      setCustomThemes((prev) => {
        const next = [...prev, newTheme]
        try {
          localStorage.setItem(STORAGE_CUSTOM_THEMES_KEY, JSON.stringify(next))
        } catch {}
        return next
      })

      setUserTheme(newTheme.id)
      return newTheme.id
    },
    [setUserTheme]
  )

  const updateTheme = useCallback(
    (themeId: string, input: CustomThemeInput) => {
      setCustomThemes((prev) => {
        const next = prev.map((t) => {
          if (t.id === themeId) {
            return {
              ...t,
              name: input.name.trim() || t.name,
              mode: input.mode,
              colors: deriveThemeColors(input),
            }
          }
          return t
        })
        try {
          localStorage.setItem(STORAGE_CUSTOM_THEMES_KEY, JSON.stringify(next))
        } catch {}
        return next
      })
    },
    []
  )

  const deleteTheme = useCallback(
    (themeId: string) => {
      setCustomThemes((prev) => {
        const next = prev.filter((t) => t.id !== themeId)
        try {
          localStorage.setItem(STORAGE_CUSTOM_THEMES_KEY, JSON.stringify(next))
        } catch {}
        return next
      })

      if (userThemeId === themeId) {
        setUserTheme('server-default')
      }
    },
    [userThemeId, setUserTheme]
  )

  const value = useMemo(
    () => ({
      themes: allThemes,
      activeTheme,
      activeThemeId,
      userThemeId,
      serverThemeId,
      setTheme,
      setUserTheme,
      setServerTheme,
      createTheme,
      updateTheme,
      deleteTheme,
      isLoaded,
    }),
    [
      allThemes,
      activeTheme,
      activeThemeId,
      userThemeId,
      serverThemeId,
      setTheme,
      setUserTheme,
      setServerTheme,
      createTheme,
      updateTheme,
      deleteTheme,
      isLoaded,
    ]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
