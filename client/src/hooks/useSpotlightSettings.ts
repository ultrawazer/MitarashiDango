import { useSetting, useUpdateSetting } from './useSettings'
import { useCallback, useEffect } from 'react'

export type SpotlightStyle = 'modern' | 'legacy'

const LOCAL_STORAGE_STYLE_KEY = 'dango_spotlight_style'
const LOCAL_STORAGE_BLUR_KEY = 'dango_spotlight_blur'

export function useSpotlightSettings() {
  const { data: userStyleData } = useSetting('spotlight_style')
  const { data: serverStyleData } = useSetting('server_spotlight_style')
  const { data: userBlurData } = useSetting('spotlight_blur')
  const { data: serverBlurData } = useSetting('server_spotlight_blur')

  const updateSetting = useUpdateSetting({ silent: true })

  const parseBlur = (val: unknown): number | null => {
    if (val === null || val === undefined || val === '') return null
    const num = Number(val)
    return !isNaN(num) && num >= 0 && num <= 60 ? num : null
  }

  // Fallbacks from localStorage for instant initial paint
  const cachedStyle = (() => {
    try {
      const s = localStorage.getItem(LOCAL_STORAGE_STYLE_KEY)
      return s === 'legacy' || s === 'modern' ? s : null
    } catch {
      return null
    }
  })()

  const cachedBlur = (() => {
    try {
      const b = localStorage.getItem(LOCAL_STORAGE_BLUR_KEY)
      return parseBlur(b)
    } catch {
      return null
    }
  })()

  // Server defaults
  const serverStyle: SpotlightStyle = serverStyleData === 'legacy' ? 'legacy' : 'modern'
  const serverBlur: number = parseBlur(serverBlurData) ?? 28

  // User explicit choices (null if not set / following server)
  const userStyle: SpotlightStyle | null =
    userStyleData === 'legacy' || userStyleData === 'modern' ? userStyleData : null
  const userBlur: number | null = parseBlur(userBlurData)

  // Effective style and blur
  const effectiveStyle: SpotlightStyle = userStyle ?? serverStyle ?? cachedStyle ?? 'modern'
  const effectiveBlur: number = userBlur ?? serverBlur ?? cachedBlur ?? 28

  // Synchronize CSS variable and localStorage cache
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_STYLE_KEY, effectiveStyle)
      localStorage.setItem(LOCAL_STORAGE_BLUR_KEY, String(effectiveBlur))
      document.documentElement.style.setProperty('--spotlight-blur', `${effectiveBlur}px`)
    } catch {
      // Ignore storage errors
    }
  }, [effectiveStyle, effectiveBlur])

  const setSpotlightStyle = useCallback(
    (style: SpotlightStyle) => {
      try {
        localStorage.setItem(LOCAL_STORAGE_STYLE_KEY, style)
      } catch {}
      updateSetting.mutate({ key: 'spotlight_style', value: style })
    },
    [updateSetting]
  )

  const setSpotlightBlur = useCallback(
    (blur: number) => {
      try {
        localStorage.setItem(LOCAL_STORAGE_BLUR_KEY, String(blur))
        document.documentElement.style.setProperty('--spotlight-blur', `${blur}px`)
      } catch {}
      updateSetting.mutate({ key: 'spotlight_blur', value: String(blur) })
    },
    [updateSetting]
  )

  const setServerSpotlightStyle = useCallback(
    (style: SpotlightStyle) => {
      updateSetting.mutate({ key: 'server_spotlight_style', value: style })
    },
    [updateSetting]
  )

  const setServerSpotlightBlur = useCallback(
    (blur: number) => {
      try {
        document.documentElement.style.setProperty('--spotlight-blur', `${blur}px`)
      } catch {}
      updateSetting.mutate({ key: 'server_spotlight_blur', value: String(blur) })
    },
    [updateSetting]
  )

  const resetToDefault = useCallback(() => {
    try {
      localStorage.removeItem(LOCAL_STORAGE_STYLE_KEY)
      localStorage.removeItem(LOCAL_STORAGE_BLUR_KEY)
      document.documentElement.style.setProperty('--spotlight-blur', `${serverBlur}px`)
    } catch {}
    updateSetting.mutate({ key: 'spotlight_style', value: '' })
    updateSetting.mutate({ key: 'spotlight_blur', value: '' })
  }, [updateSetting, serverBlur])

  return {
    style: effectiveStyle,
    isModern: effectiveStyle === 'modern',
    blur: effectiveBlur,
    userStyle,
    userBlur,
    serverStyle,
    serverBlur,
    hasUserOverride: userStyle !== null || userBlur !== null,
    setSpotlightStyle,
    setSpotlightBlur,
    setServerSpotlightStyle,
    setServerSpotlightBlur,
    resetToDefault,
  }
}
