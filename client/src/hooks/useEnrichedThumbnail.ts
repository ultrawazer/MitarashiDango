import { useEffect, useState } from 'react'
import { fetchApi } from '../lib/fetchApi'

const isMissing = (url: string | undefined | null): boolean => {
  if (!url) return true
  const trimmed = url.trim()
  return trimmed === '' || trimmed.includes('placeholder')
}

export function useEnrichedThumbnail(
  showId: string | undefined,
  thumbnail: string | undefined
): { thumbnail: string | undefined } {
  const [resolved, setResolved] = useState<string | undefined>(thumbnail)

  useEffect(() => {
    setResolved(thumbnail)
  }, [thumbnail])

  useEffect(() => {
    if (!isMissing(thumbnail)) return
    if (!showId) return
    let cancelled = false
    fetchApi(`/api/show-meta/${showId}`)
      .then((meta) => {
        const fresh = (meta as { thumbnail?: string } | null)?.thumbnail
        if (!cancelled && fresh && fresh.trim() !== '' && !fresh.includes('placeholder')) {
          setResolved(fresh)
        }
      })
      .catch(() => {
        // ignore
      })
    return () => {
      cancelled = true
    }
  }, [showId, thumbnail])

  return { thumbnail: resolved }
}
