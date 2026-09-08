import React, { useState, useEffect, useCallback, useMemo } from 'react'
import type { Theme, CustomThemeInput } from '../types/theme'
import { PRESET_THEMES, ThemeContext } from './ThemeContext'
import { applyThemeToDocument, deriveThemeColors } from '../utils/themeUtils'
import { useSetting, useUpdateSetting } from '../hooks/useSettings'

const STORAGE_CUSTOM_THEMES_KEY = 'dango-custom-themes'
const STORAGE_ACTIVE_THEME_KEY = 'dango-active-theme'

interface ThemeProviderProps {
  children: React.ReactNode
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const { data: serverThemeSetting } = useSetting('activeTheme')
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

  const [activeThemeId, setActiveThemeId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_ACTIVE_THEME_KEY)
      if (saved) return saved
    } catch {
      // Fallback to default
    }
    return 'dango'
  })

  const [isLoaded, setIsLoaded] = useState<boolean>(false)

  // Sync with server setting once available
  useEffect(() => {
    if (serverThemeSetting && typeof serverThemeSetting === 'string') {
      setActiveThemeId((prev) => {
        if (prev !== serverThemeSetting) {
          localStorage.setItem(STORAGE_ACTIVE_THEME_KEY, serverThemeSetting)
          return serverThemeSetting
        }
        return prev
      })
    }
  }, [serverThemeSetting])

  const allThemes = useMemo(() => {
    return [...PRESET_THEMES, ...customThemes]
  }, [customThemes])

  const activeTheme = useMemo(() => {
    return allThemes.find((t) => t.id === activeThemeId) || PRESET_THEMES[0]
  }, [allThemes, activeThemeId])

  // Apply theme variables to document on active theme change
  useEffect(() => {
    applyThemeToDocument(activeTheme)
    setIsLoaded(true)
  }, [activeTheme])

  const setTheme = useCallback(
    (themeId: string) => {
      setActiveThemeId(themeId)
      try {
        localStorage.setItem(STORAGE_ACTIVE_THEME_KEY, themeId)
      } catch {}
      updateSetting.mutate({ key: 'activeTheme', value: themeId })
    },
    [updateSetting]
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

      setTheme(newTheme.id)
      return newTheme.id
    },
    [setTheme]
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

      if (activeThemeId === themeId) {
        setTheme('dango')
      }
    },
    [activeThemeId, setTheme]
  )

  const value = useMemo(
    () => ({
      themes: allThemes,
      activeTheme,
      activeThemeId,
      setTheme,
      createTheme,
      updateTheme,
      deleteTheme,
      isLoaded,
    }),
    [allThemes, activeTheme, activeThemeId, setTheme, createTheme, updateTheme, deleteTheme, isLoaded]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
