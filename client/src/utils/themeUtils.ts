import type { Theme, ThemeColors, CustomThemeInput } from '../types/theme'

function normalizeHex(hex: string): string {
  let clean = hex.trim().replace(/^#/, '')
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((c) => c + c)
      .join('')
  }
  return `#${clean.padEnd(6, '0').slice(0, 6)}`
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const normalized = normalizeHex(hex)
  const r = parseInt(normalized.slice(1, 3), 16) / 255
  const g = parseInt(normalized.slice(3, 5), 16) / 255
  const b = parseInt(normalized.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
    }
    h /= 6
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  }
}

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = normalizeHex(hex)
  const r = parseInt(normalized.slice(1, 3), 16)
  const g = parseInt(normalized.slice(3, 5), 16)
  const b = parseInt(normalized.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function lighten(hex: string, percent: number): string {
  const normalized = normalizeHex(hex)
  const num = parseInt(normalized.slice(1), 16)
  const amt = Math.round(2.55 * percent)
  const R = Math.min(255, (num >> 16) + amt)
  const G = Math.min(255, ((num >> 8) & 0x00ff) + amt)
  const B = Math.min(255, (num & 0x0000ff) + amt)
  return `#${((1 << 24) | (R << 16) | (G << 8) | B).toString(16).slice(1)}`
}

export function darken(hex: string, percent: number): string {
  const normalized = normalizeHex(hex)
  const num = parseInt(normalized.slice(1), 16)
  const amt = Math.round(2.55 * percent)
  const R = Math.max(0, (num >> 16) - amt)
  const G = Math.max(0, ((num >> 8) & 0x00ff) - amt)
  const B = Math.max(0, (num & 0x0000ff) - amt)
  return `#${((1 << 24) | (R << 16) | (G << 8) | B).toString(16).slice(1)}`
}

export function deriveThemeColors(input: CustomThemeInput): ThemeColors {
  const isLight = input.mode === 'light'
  const bgMain = normalizeHex(input.bgMain)
  const textPrimary = normalizeHex(input.textPrimary)
  const accentPrimary = normalizeHex(input.accentPrimary)
  const accentSecondary = normalizeHex(input.accentSecondary)

  return {
    bgMain,
    bgPrimary: isLight ? darken(bgMain, 4) : lighten(bgMain, 6),
    bgSecondary: isLight ? darken(bgMain, 7) : lighten(bgMain, 4),
    bgTertiary: isLight ? darken(bgMain, 10) : lighten(bgMain, 8),
    bgElevated: isLight ? '#ffffff' : lighten(bgMain, 14),
    textPrimary,
    textSecondary: isLight ? lighten(textPrimary, 25) : darken(textPrimary, 25),
    textMuted: isLight ? lighten(textPrimary, 45) : darken(textPrimary, 40),
    accentPrimary,
    accentSecondary,
  }
}

export function applyThemeToDocument(theme: Theme): void {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  const { colors } = theme

  // Canvas and background surfaces
  root.style.setProperty('--bg-main', colors.bgMain)
  root.style.setProperty('--bg-primary', colors.bgPrimary)
  root.style.setProperty('--bg-secondary', colors.bgSecondary)
  root.style.setProperty('--bg-tertiary', colors.bgTertiary)
  root.style.setProperty('--bg-elevated', colors.bgElevated)
  root.style.setProperty('--header-bg', hexToRgba(colors.bgSecondary, 0.85))

  // Typography
  root.style.setProperty('--text-primary', colors.textPrimary)
  root.style.setProperty('--text-secondary', colors.textSecondary)
  root.style.setProperty('--text-tertiary', colors.textMuted)
  root.style.setProperty('--text-muted', colors.textMuted)

  // Primary Accent & HSL Channels
  const { h, s, l } = hexToHsl(colors.accentPrimary)
  root.style.setProperty('--accent', colors.accentPrimary)
  root.style.setProperty('--primary-color', colors.accentPrimary)
  root.style.setProperty('--accent-h', `${h}`)
  root.style.setProperty('--accent-s', `${s}%`)
  root.style.setProperty('--accent-l', `${l}%`)
  root.style.setProperty(
    '--accent-light',
    `hsl(${h}, ${Math.min(100, s + 5)}%, ${Math.min(95, l + 12)}%)`
  )
  root.style.setProperty(
    '--accent-lighter',
    `hsl(${h}, ${Math.min(100, s + 5)}%, ${Math.min(98, l + 22)}%)`
  )
  root.style.setProperty(
    '--accent-dark',
    `hsl(${h}, ${Math.max(0, s - 5)}%, ${Math.max(15, l - 15)}%)`
  )
  root.style.setProperty('--accent-glow', `hsla(${h}, ${s}%, ${l}%, 0.45)`)
  root.style.setProperty('--border-accent', `hsla(${h}, ${s}%, ${l}%, 0.3)`)

  // Secondary Accent & HSL Channels
  const sec = hexToHsl(colors.accentSecondary)
  root.style.setProperty('--secondary-h', `${sec.h}`)
  root.style.setProperty('--secondary-s', `${sec.s}%`)
  root.style.setProperty('--secondary-l', `${sec.l}%`)
  root.style.setProperty('--accent-blue', colors.accentSecondary)
  root.style.setProperty(
    '--accent-blue-light',
    `hsl(${sec.h}, ${sec.s}%, ${Math.min(95, sec.l + 15)}%)`
  )

  // Gradients
  root.style.setProperty(
    '--accent-gradient',
    `linear-gradient(135deg, ${colors.accentPrimary} 0%, ${colors.accentSecondary} 100%)`
  )

  // TV / Spatial Navigation Focus Rings
  root.style.setProperty(
    '--focus-ring-color',
    `hsl(${h}, ${Math.min(100, s + 5)}%, ${Math.min(95, l + 12)}%)`
  )
  root.style.setProperty(
    '--focus-ring-glow',
    `0 0 0 3px hsla(${h}, ${s}%, ${l}%, 0.4), 0 0 20px hsla(${h}, ${s}%, ${l}%, 0.45)`
  )

  // Glass & Border adaptation
  const isLight = theme.mode === 'light'
  root.style.setProperty(
    '--glass-bg',
    isLight ? 'rgba(255, 255, 255, 0.88)' : 'rgba(20, 20, 22, 0.95)'
  )
  root.style.setProperty(
    '--glass-border',
    isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)'
  )
  root.style.setProperty(
    '--glass-highlight',
    isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.05)'
  )
  root.style.setProperty(
    '--border-primary',
    isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)'
  )
  root.style.setProperty(
    '--border-secondary',
    isLight ? 'rgba(0, 0, 0, 0.14)' : 'rgba(255, 255, 255, 0.14)'
  )
  root.style.setProperty(
    '--border',
    isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)'
  )

  // Color scheme meta
  root.style.colorScheme = theme.mode
}
