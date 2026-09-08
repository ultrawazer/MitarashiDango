import React, { useState, useEffect } from 'react'
import styles from './Player.module.css'
import type { VideoSource } from '../../pages/Player'

interface ExtensionOption {
  id: string
  name: string
  mature: boolean
}

interface ProviderSelectorProps {
  selectedProvider: string
  onProviderChange: (provider: string) => void
  isAdult?: boolean
}

export const ProviderSelector: React.FC<ProviderSelectorProps> = ({
  selectedProvider,
  onProviderChange,
  isAdult,
}) => {
  const [providers, setProviders] = useState<ExtensionOption[]>([
    { id: 'shoko', name: 'Shoko (Local)', mature: false },
  ])

  useEffect(() => {
    let isMounted = true
    fetch('/api/extensions?type=anime')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: any[]) => {
        if (!isMounted) return
        const list: ExtensionOption[] = [
          { id: 'shoko', name: 'Shoko (Local)', mature: false },
        ]
        for (const ext of data) {
          if (ext.enabled && ext.id !== 'shoko') {
            list.push({
              id: ext.id,
              name: ext.metadata?.name || ext.name || ext.id,
              mature: ext.metadata?.mature ?? ext.mature ?? false,
            })
          }
        }
        setProviders(list)
      })
      .catch(() => {})
    return () => {
      isMounted = false
    }
  }, [])

  const visibleProviders =
    isAdult === undefined
      ? providers
      : providers.filter((option) => option.mature === isAdult)

  return (
    <div className={styles.providerSelectContainer}>
      <h4>Provider</h4>
      <select
        className={styles.providerSelect}
        value={selectedProvider}
        onChange={(e) => onProviderChange(e.target.value)}
      >
        {visibleProviders.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  )
}

interface SourceSelectorProps {
  videoSources: VideoSource[]
  selectedSource: VideoSource | null
  onSourceChange: (source: VideoSource) => void
}

const SourceSelector: React.FC<SourceSelectorProps> = ({
  videoSources,
  selectedSource,
  onSourceChange,
}) => {
  const sources = Array.isArray(videoSources) ? videoSources : []

  if (sources.length === 0) return null

  return (
    <div className={styles.sourceSelectionContainer}>
      <h4>Source</h4>
      <div className={styles.sourceButtons}>
        {sources.map((source, i) => (
          <button
            key={`${source.sourceName}-${i}`}
            className={`${styles.sourceButton} ${selectedSource?.sourceName === source.sourceName ? styles.active : ''} `}
            onClick={() => onSourceChange(source)}
          >
            {source.sourceName}
          </button>
        ))}
      </div>
    </div>
  )
}

export default React.memo(SourceSelector, (prevProps, nextProps) => {
  return (
    prevProps.selectedSource?.sourceName === nextProps.selectedSource?.sourceName &&
    prevProps.videoSources === nextProps.videoSources
  )
})
