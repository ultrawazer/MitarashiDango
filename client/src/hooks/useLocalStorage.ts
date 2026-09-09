import { useCallback, useEffect, useState } from 'react'

export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (val: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) return initialValue
      if (typeof initialValue === 'string') return raw as T
      try {
        return JSON.parse(raw) as T
      } catch {
        return raw as T
      }
    } catch {
      return initialValue
    }
  })

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return
      try {
        if (e.newValue === null) {
          setValue(initialValue)
        } else if (typeof initialValue === 'string') {
          setValue(e.newValue as T)
        } else {
          try {
            setValue(JSON.parse(e.newValue) as T)
          } catch {
            setValue(e.newValue as T)
          }
        }
      } catch {
        setValue(initialValue)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [key, initialValue])

  const setStoredValue = useCallback(
    (val: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const next = typeof val === 'function' ? (val as (prev: T) => T)(prev) : val
        try {
          if (next === undefined || next === null) {
            localStorage.removeItem(key)
          } else if (typeof next === 'string') {
            localStorage.setItem(key, next)
          } else {
            localStorage.setItem(key, JSON.stringify(next))
          }
        } catch {
          // Ignore quota / permission errors
        }
        return next
      })
    },
    [key]
  )

  return [value, setStoredValue]
}
