import { createContext, useContext } from 'react'
import type { Theme, ThemeContextValue } from '../types/theme'

export const PRESET_THEMES: Theme[] = [
  {
    id: 'dango',
    name: 'Dango',
    isPreset: true,
    isDefault: true,
    mode: 'dark',
    colors: {
      bgMain: '#050505',
      bgPrimary: '#17171a',
      bgSecondary: '#0f0f11',
      bgTertiary: '#18181b',
      bgElevated: '#27272a',
      textPrimary: '#ffffff',
      textSecondary: '#b4b4bd',
      textMuted: '#8f8f98',
      accentPrimary: '#8b5cf6',
      accentSecondary: '#06b6d4',
    },
  },
  {
    id: 'mitarashi-dango',
    name: 'Mitarashi Dango',
    isPreset: true,
    mode: 'dark',
    colors: {
      bgMain: '#050505',
      bgPrimary: '#17171a',
      bgSecondary: '#0f0f11',
      bgTertiary: '#18181b',
      bgElevated: '#27272a',
      textPrimary: '#ffffff',
      textSecondary: '#b4b4bd',
      textMuted: '#8f8f98',
      accentPrimary: '#CE8A4B',
      accentSecondary: '#E6BA79',
    },
  },
  {
    id: 'sakura',
    name: 'Sakura',
    isPreset: true,
    mode: 'dark',
    colors: {
      bgMain: '#080709',
      bgPrimary: '#171419',
      bgSecondary: '#100d13',
      bgTertiary: '#1d1822',
      bgElevated: '#282030',
      textPrimary: '#ffffff',
      textSecondary: '#b8a8b8',
      textMuted: '#8b7a8b',
      accentPrimary: '#ec4899',
      accentSecondary: '#f472b6',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    isPreset: true,
    mode: 'dark',
    colors: {
      bgMain: '#05070a',
      bgPrimary: '#0f151e',
      bgSecondary: '#090e16',
      bgTertiary: '#151e2b',
      bgElevated: '#1e2a3c',
      textPrimary: '#ffffff',
      textSecondary: '#9eb3c7',
      textMuted: '#74879b',
      accentPrimary: '#0ea5e9',
      accentSecondary: '#22d3ee',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    isPreset: true,
    mode: 'dark',
    colors: {
      bgMain: '#050806',
      bgPrimary: '#111a14',
      bgSecondary: '#0a110c',
      bgTertiary: '#16231a',
      bgElevated: '#203326',
      textPrimary: '#ffffff',
      textSecondary: '#a0b8a6',
      textMuted: '#748b7a',
      accentPrimary: '#22c55e',
      accentSecondary: '#10b981',
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    isPreset: true,
    mode: 'dark',
    colors: {
      bgMain: '#080605',
      bgPrimary: '#191410',
      bgSecondary: '#120e0b',
      bgTertiary: '#221a15',
      bgElevated: '#31251f',
      textPrimary: '#ffffff',
      textSecondary: '#bba69c',
      textMuted: '#8c786e',
      accentPrimary: '#f59e0b',
      accentSecondary: '#ef4444',
    },
  },
]

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
