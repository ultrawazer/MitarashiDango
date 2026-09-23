import React, { useState } from 'react'
import { FaChevronLeft, FaClosedCaptioning, FaCog, FaCheck } from 'react-icons/fa'
import styles from './PlayerSettings.module.css'
import type { VideoSource, VideoLink, SubtitleTrack } from '../../types/player'

interface PlayerSettingsProps {
  isOpen: boolean
  onClose: () => void
  videoSources: VideoSource[]
  currentSource: VideoSource | null
  currentLink: VideoLink | null
  onSourceChange: (source: VideoSource, link: VideoLink) => void
  subtitles: SubtitleTrack[]
  activeSubtitleTrack: string | null
  onSubtitleChange: (trackLabel: string | null) => void
  selectedAudioTrackIndex?: number
  onAudioTrackChange?: (index: number) => void
  subtitleSettings: {
    fontSize: number
    position: number
  }
  onSubtitleSettingsChange: (key: 'fontSize' | 'position', value: number) => void
  useNativeControls: boolean
  onNativeControlsToggle: (value: boolean) => void
  anime4kEnabled?: boolean
  onAnime4kToggle?: () => void
  anime4kSupported?: boolean
  anime4kProfile?: 'low' | 'balanced' | 'high' | 'denoise'
  onAnime4kProfileChange?: (profile: 'low' | 'balanced' | 'high' | 'denoise') => void
  anime4kInitializing?: boolean
  anime4kError?: string | null
  anime4kZeroCopy?: boolean
  onAnime4kZeroCopyToggle?: () => void
  avSyncDelay?: number
  onAvSyncDelayChange?: (ms: number) => void
  onOpenAvSyncCalibrator?: () => void
  isAutoSkipEnabled?: boolean
  onAutoSkipChange?: (value: boolean) => void
  isAutoplayEnabled?: boolean
  onAutoplayChange?: (value: boolean) => void
}

type SettingsView = 'main' | 'quality' | 'subtitles' | 'subtitle-style' | 'audio' | 'upscaler' | 'av-sync' | 'playback'

const PlayerSettings = (props: PlayerSettingsProps, ref: React.ForwardedRef<HTMLDivElement>) => {
  const {
    isOpen,
    onClose,
    videoSources,
    currentSource,
    currentLink,
    onSourceChange,
    subtitles,
    activeSubtitleTrack,
    onSubtitleChange,
    selectedAudioTrackIndex,
    onAudioTrackChange,
    subtitleSettings,
    onSubtitleSettingsChange,
    useNativeControls,
    onNativeControlsToggle,
    anime4kEnabled = false,
    onAnime4kToggle,
    anime4kSupported = false,
    anime4kProfile = 'balanced',
    onAnime4kProfileChange,
    anime4kInitializing = false,
    anime4kError = null,
    anime4kZeroCopy = true,
    onAnime4kZeroCopyToggle,
    avSyncDelay = 0,
    onAvSyncDelayChange,
    onOpenAvSyncCalibrator,
    isAutoSkipEnabled = false,
    onAutoSkipChange,
    isAutoplayEnabled = false,
    onAutoplayChange,
  } = props
  const [view, setView] = useState<SettingsView>('main')

  React.useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => setView('main'), 300)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  const renderMain = () => (
    <div className={styles.menuContent}>
      <button className={styles.menuItem} onClick={() => setView('quality')}>
        <span>Quality</span>
        <span className={styles.currentValue}>{currentLink?.resolutionStr || 'Auto'}</span>
      </button>
      {currentSource?.audioTracks && currentSource.audioTracks.length > 0 && (
        <button className={styles.menuItem} onClick={() => setView('audio')} id="player-audio-track-btn">
          <span>Audio Track</span>
          <span className={styles.currentValue}>
            {currentSource.audioTracks.find((t) => t.index === selectedAudioTrackIndex)?.label ||
              currentSource.audioTracks[0]?.label ||
              'Default'}
          </span>
        </button>
      )}
      <button className={styles.menuItem} onClick={() => setView('subtitles')}>
        <span>Subtitles</span>
        <span className={styles.currentValue}>{activeSubtitleTrack || 'Off'}</span>
      </button>
      <button className={styles.menuItem} onClick={() => setView('subtitle-style')}>
        <span>Subtitle Style</span>
      </button>
      <button className={styles.menuItem} onClick={() => setView('playback')}>
        <span>Playback</span>
        <span className={styles.currentValue}>
          {[isAutoSkipEnabled ? 'Auto-skip On' : null, isAutoplayEnabled ? 'Autoplay On' : null]
            .filter(Boolean)
            .join(' • ') || 'Off'}
        </span>
      </button>
      <button className={styles.menuItem} onClick={() => setView('av-sync')} id="player-av-sync-btn">
        <span>A/V Sync</span>
        <span className={styles.currentValue}>{avSyncDelay ? `${avSyncDelay}ms` : '0ms'}</span>
      </button>
      <button
        className={`${styles.menuItem} ${useNativeControls ? styles.selected : ''}`}
        onClick={() => {
          const newValue = !useNativeControls
          onNativeControlsToggle(newValue)
          localStorage.setItem('playerUseNativeControls', newValue.toString())
        }}
      >
        <span>Native Controls</span>
        {useNativeControls && <FaCheck size={12} />}
      </button>
      {anime4kSupported && (
        <button
          className={styles.menuItem}
          onClick={() => setView('upscaler')}
          id="player-upscaler-btn"
        >
          <span>AI Upscaler</span>
          <span className={styles.currentValue}>
            {anime4kEnabled
              ? anime4kInitializing
                ? 'Loading...'
                : anime4kProfile
                  ? anime4kProfile.charAt(0).toUpperCase() + anime4kProfile.slice(1)
                  : 'On'
              : 'Off'}
          </span>
        </button>
      )}
    </div>
  )

  const renderAudio = () => {
    const tracks = currentSource?.audioTracks || []
    return (
      <div className={styles.menuContent}>
        {tracks.map((track) => {
          const isSelected =
            selectedAudioTrackIndex === track.index ||
            (selectedAudioTrackIndex === undefined && track.isDefault)
          return (
            <button
              key={track.index}
              className={`${styles.menuItem} ${isSelected ? styles.selected : ''}`}
              onClick={() => {
                onAudioTrackChange?.(track.index)
                setView('main')
              }}
            >
              <span>{track.label}</span>
              {isSelected && <FaCheck size={12} />}
            </button>
          )
        })}
      </div>
    )
  }

  const renderQuality = () => {
    const links =
      currentSource?.links.sort(
        (a, b) => (parseInt(b.resolutionStr) || 0) - (parseInt(a.resolutionStr) || 0)
      ) || []
    return (
      <div className={styles.menuContent}>
        {links.map((link) => (
          <button
            key={link.resolutionStr}
            className={`${styles.menuItem} ${currentLink?.resolutionStr === link.resolutionStr ? styles.selected : ''} `}
            onClick={() => onSourceChange(currentSource!, link)}
          >
            <span>{link.resolutionStr}</span>
            {currentLink?.resolutionStr === link.resolutionStr && <FaCheck size={12} />}
          </button>
        ))}
      </div>
    )
  }

  const renderSubtitles = () => (
    <div className={styles.menuContent}>
      <button
        className={`${styles.menuItem} ${activeSubtitleTrack === 'off' ? styles.selected : ''} `}
        onClick={() => onSubtitleChange('off')}
      >
        <span>Off</span>
        {activeSubtitleTrack === 'off' && <FaCheck size={12} />}
      </button>
      {subtitles.map((sub) => (
        <button
          key={sub.label}
          className={`${styles.menuItem} ${activeSubtitleTrack === (sub.label || sub.lang) ? styles.selected : ''} `}
          onClick={() => onSubtitleChange(sub.label || sub.lang)}
        >
          <span>{sub.label}</span>
          {activeSubtitleTrack === (sub.label || sub.lang) && <FaCheck size={12} />}
        </button>
      ))}
    </div>
  )

  const renderSubtitleStyle = () => (
    <div className={styles.menuContent}>
      <div className={styles.sliderGroup}>
        <label>Font Size ({subtitleSettings.fontSize.toFixed(1)})</label>
        <input
          type="range"
          min="0.5"
          max="10"
          step="0.5"
          value={subtitleSettings.fontSize}
          onInput={(e) =>
            onSubtitleSettingsChange('fontSize', parseFloat((e.target as HTMLInputElement).value))
          }
          style={
            {
              '--slider-percent': `${((subtitleSettings.fontSize - 0.5) / 9.5) * 100}%`,
            } as React.CSSProperties
          }
        />
      </div>
      <div className={styles.sliderGroup}>
        <label>Vertical Position (Lift)</label>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={subtitleSettings.position}
          onInput={(e) =>
            onSubtitleSettingsChange('position', parseInt((e.target as HTMLInputElement).value))
          }
          style={{ '--slider-percent': `${subtitleSettings.position}%` } as React.CSSProperties}
        />
      </div>
    </div>
  )

  const renderUpscaler = () => (
    <div className={styles.menuContent}>
      {anime4kInitializing && (
        <div className={styles.menuNote} role="status">
          Preparing GPU, this can take a few seconds…
        </div>
      )}
      {anime4kError && (
        <div className={styles.menuError} role="alert">
          Upscaler failed: {anime4kError}
        </div>
      )}

      <button
        className={`${styles.menuItem} ${anime4kEnabled ? styles.selected : ''}`}
        onClick={() => onAnime4kToggle?.()}
        id="player-ai-upscaler-toggle-btn"
      >
        <span>Enable Upscaler</span>
        {anime4kEnabled && <FaCheck size={12} />}
      </button>

      <div
        style={{
          marginTop: '0.5rem',
          paddingTop: '0.5rem',
          borderTop: '1px solid var(--border-color, rgba(255,255,255,0.1))',
          marginBottom: '0.25rem',
        }}
      >
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--text-tertiary)',
            paddingLeft: '0.5rem',
          }}
        >
          Profile
        </span>
      </div>

      <button
        className={`${styles.menuItem} ${anime4kProfile === 'low' ? styles.selected : ''}`}
        onClick={() => onAnime4kProfileChange?.('low')}
      >
        <div>
          <div>Low</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
            Lightest, best for weaker GPUs
          </div>
        </div>
        {anime4kProfile === 'low' && <FaCheck size={12} />}
      </button>
      <button
        className={`${styles.menuItem} ${anime4kProfile === 'balanced' ? styles.selected : ''}`}
        onClick={() => onAnime4kProfileChange?.('balanced')}
      >
        <div>
          <div>Balanced</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
            Source + display aware
          </div>
        </div>
        {anime4kProfile === 'balanced' && <FaCheck size={12} />}
      </button>
      <button
        className={`${styles.menuItem} ${anime4kProfile === 'high' ? styles.selected : ''}`}
        onClick={() => onAnime4kProfileChange?.('high')}
      >
        <div>
          <div>High</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
            Aggressive, needs strong GPU
          </div>
        </div>
        {anime4kProfile === 'high' && <FaCheck size={12} />}
      </button>
      <button
        className={`${styles.menuItem} ${anime4kProfile === 'denoise' ? styles.selected : ''}`}
        onClick={() => onAnime4kProfileChange?.('denoise')}
      >
        <div>
          <div>Denoise</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
            Clean noisy/compressed sources
          </div>
        </div>
        {anime4kProfile === 'denoise' && <FaCheck size={12} />}
      </button>

      <div
        style={{
          marginTop: '0.75rem',
          paddingTop: '0.75rem',
          borderTop: '1px solid var(--border-color, rgba(255,255,255,0.1))',
        }}
      >
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            padding: '6px 4px',
          }}
        >
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>Direct GPU Upload (Fast)</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
              Zero-copy WebGPU texture upload (uncheck for legacy Bitmap mode)
            </div>
          </div>
          <input
            type="checkbox"
            checked={anime4kZeroCopy}
            onChange={() => onAnime4kZeroCopyToggle?.()}
            style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--accent-color)' }}
          />
        </label>
      </div>
    </div>
  )

  const renderAvSync = () => (
    <div className={styles.menuContent}>
      <div className={styles.sliderGroup}>
        <label>Video delay ({avSyncDelay || 0}ms)</label>
        <input
          type="range"
          min={0}
          max={500}
          step={5}
          value={avSyncDelay || 0}
          onInput={(e) =>
            onAvSyncDelayChange?.(parseInt((e.target as HTMLInputElement).value, 10))
          }
          style={
            {
              '--slider-percent': `${((avSyncDelay || 0) / 500) * 100}%`,
            } as React.CSSProperties
          }
          aria-label="Video delay milliseconds"
        />
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <button
          className={styles.menuItem}
          style={{ justifyContent: 'center', flex: 1, padding: '8px' }}
          onClick={() => onAvSyncDelayChange?.(0)}
        >
          Reset (0ms)
        </button>
        {onOpenAvSyncCalibrator && (
          <button
            className={styles.menuItem}
            style={{ justifyContent: 'center', flex: 1, padding: '8px' }}
            onClick={() => {
              onOpenAvSyncCalibrator()
              onClose()
            }}
          >
            Calibrate...
          </button>
        )}
      </div>
    </div>
  )

  const renderPlayback = () => (
    <div className={styles.menuContent}>
      <button
        type="button"
        className={`${styles.menuItem} ${isAutoSkipEnabled ? styles.selected : ''}`}
        onClick={() => onAutoSkipChange?.(!isAutoSkipEnabled)}
        aria-pressed={isAutoSkipEnabled}
      >
        <span>Auto-skip openings and endings</span>
        <span className={styles.currentValue}>{isAutoSkipEnabled ? 'On' : 'Off'}</span>
      </button>
      <div className={styles.menuNote}>
        Automatically jump past opening, ending and recap segments when detected.
      </div>
      <button
        type="button"
        className={`${styles.menuItem} ${isAutoplayEnabled ? styles.selected : ''}`}
        onClick={() => onAutoplayChange?.(!isAutoplayEnabled)}
        aria-pressed={isAutoplayEnabled}
      >
        <span>Autoplay next episode</span>
        <span className={styles.currentValue}>{isAutoplayEnabled ? 'On' : 'Off'}</span>
      </button>
      <div className={styles.menuNote}>
        Automatically start the next episode when this one ends.
      </div>
    </div>
  )

  if (!isOpen) return null

  return (
    <div ref={ref} className={styles.settingsPanel} onClick={(e) => e.stopPropagation()}>
      <div className={styles.header}>
        {view !== 'main' && (
          <button className={styles.backBtn} onClick={() => setView('main')}>
            <FaChevronLeft />
          </button>
        )}
        <h3>
          {view === 'main'
            ? 'Settings'
            : view === 'upscaler'
              ? 'Upscaler Settings'
              : view === 'av-sync'
                ? 'A/V Sync'
                : view.charAt(0).toUpperCase() + view.slice(1).replace('-', ' ')}
        </h3>
      </div>

      <div className={styles.contentWrapper}>
        {view === 'main' && renderMain()}
        {view === 'audio' && renderAudio()}
        {view === 'quality' && renderQuality()}
        {view === 'subtitles' && renderSubtitles()}
        {view === 'subtitle-style' && renderSubtitleStyle()}
        {view === 'upscaler' && renderUpscaler()}
        {view === 'av-sync' && renderAvSync()}
        {view === 'playback' && renderPlayback()}
      </div>
    </div>
  )
}

export default React.forwardRef(PlayerSettings)
