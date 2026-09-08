export type ThemeMode = 'dark' | 'light'

export interface ThemeColors {
  bgMain: string
  bgPrimary: string
  bgSecondary: string
  bgTertiary: string
  bgElevated: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  accentPrimary: string
  accentSecondary: string
}

export interface Theme {
  id: string
  name: string
  isPreset: boolean
  isDefault?: boolean
  mode: ThemeMode
  colors: ThemeColors
}

export interface CustomThemeInput {
  name: string
  mode: ThemeMode
  bgMain: string
  textPrimary: string
  accentPrimary: string
  accentSecondary: string
}

export interface ThemeContextValue {
  themes: Theme[]
  activeTheme: Theme
  activeThemeId: string
  setTheme: (themeId: string) => void
  createTheme: (input: CustomThemeInput) => string
  updateTheme: (themeId: string, input: CustomThemeInput) => void
  deleteTheme: (themeId: string) => void
  isLoaded: boolean
}
