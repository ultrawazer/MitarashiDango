import { useState, useEffect } from 'react'
import { useTheme } from '../contexts/ThemeContext'

const logoCache = new Map<string, string>()

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let clean = hex.trim().replace(/^#/, '')
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((c) => c + c)
      .join('')
  }
  const num = parseInt(clean.padEnd(6, '0').slice(0, 6), 16)
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff,
  }
}

export function useThemedLogo(): string {
  const { activeTheme } = useTheme()

  // Default theme uses original unmanipulated logo
  if (activeTheme.id === 'dango') {
    return '/logo.png'
  }

  const cacheKey = `${activeTheme.id}-${activeTheme.colors.accentPrimary}-${activeTheme.colors.accentSecondary}`

  const [logoSrc, setLogoSrc] = useState<string>(() => {
    return logoCache.get(cacheKey) || '/logo.png'
  })

  useEffect(() => {
    if (activeTheme.id === 'dango') {
      setLogoSrc('/logo.png')
      return
    }

    const cached = logoCache.get(cacheKey)
    if (cached) {
      setLogoSrc(cached)
      return
    }

    let isMounted = true
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = '/logo.png'

    img.onload = () => {
      if (!isMounted) return

      try {
        const width = img.naturalWidth || 330
        const height = img.naturalHeight || 120
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        ctx.drawImage(img, 0, 0)
        const imageData = ctx.getImageData(0, 0, width, height)
        const data = imageData.data

        const primaryRgb = hexToRgb(activeTheme.colors.accentPrimary)
        const secondaryRgb = hexToRgb(activeTheme.colors.accentSecondary)

        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3]
          if (a < 10) continue

          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]

          const rN = r / 255
          const gN = g / 255
          const bN = b / 255
          const max = Math.max(rN, gN, bN)
          const min = Math.min(rN, gN, bN)
          const l = (max + min) / 2
          let h = 0
          let s = 0

          if (max !== min) {
            const d = max - min
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
            if (max === rN) {
              h = (gN - bN) / d + (gN < bN ? 6 : 0)
            } else if (max === gN) {
              h = (bN - rN) / d + 2
            } else {
              h = (rN - gN) / d + 4
            }
            h *= 60
          }

          // 1. Preserve crisp white centers inside letters
          if (l > 0.95 && s < 0.1) continue

          // 2. Preserve wooden skewer stick (natural brown / tan wood)
          if (h >= 10 && h <= 45 && s < 0.6) continue

          // 3. Recolor dango violet and lilac elements
          if (h >= 240 && h <= 325) {
            if (l < 0.74) {
              // Primary accent: 'dan' text and top-right dango ball
              const factor = Math.min(1.35, l / 0.67)
              data[i] = Math.min(255, Math.round(primaryRgb.r * factor))
              data[i + 1] = Math.min(255, Math.round(primaryRgb.g * factor))
              data[i + 2] = Math.min(255, Math.round(primaryRgb.b * factor))
            } else {
              // Secondary accent: bottom-left dango ball
              const factor = Math.min(1.35, l / 0.81)
              data[i] = Math.min(255, Math.round(secondaryRgb.r * factor))
              data[i + 1] = Math.min(255, Math.round(secondaryRgb.g * factor))
              data[i + 2] = Math.min(255, Math.round(secondaryRgb.b * factor))
            }
          }
        }

        ctx.putImageData(imageData, 0, 0)
        const themedUrl = canvas.toDataURL('image/png')
        logoCache.set(cacheKey, themedUrl)
        setLogoSrc(themedUrl)
      } catch (err) {
        console.error('Failed to process themed logo:', err)
        setLogoSrc('/logo.png')
      }
    }

    img.onerror = () => {
      if (isMounted) {
        setLogoSrc('/logo.png')
      }
    }

    return () => {
      isMounted = false
    }
  }, [cacheKey, activeTheme.id, activeTheme.colors.accentPrimary, activeTheme.colors.accentSecondary])

  return logoSrc
}
