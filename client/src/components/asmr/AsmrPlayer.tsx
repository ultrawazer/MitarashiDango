import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  FaPlay,
  FaPause,
  FaStepForward,
  FaStepBackward,
  FaUndo,
  FaRedo,
  FaVolumeUp,
  FaTimes,
  FaImage,
  FaEyeSlash,
  FaChevronDown,
  FaChevronUp,
  FaChevronLeft,
  FaChevronRight,
  FaListOl,
} from 'react-icons/fa'
import type { AsmrChapter, AsmrTrack } from '../../hooks/useAsmr'
import styles from './Asmr.module.css'

interface AsmrPlayerProps {
  title: string
  images: string[]
  chapters: AsmrChapter[]
  tracks: AsmrTrack[]
  trackIndex: number
  expanded: boolean
  isAdult?: boolean
  rjCode?: string
  t?: (s: string) => string
  onTrackChange: (index: number) => void
  onExpandedChange: (expanded: boolean) => void
  onClose: () => void
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

const AsmrPlayer: React.FC<AsmrPlayerProps> = ({
  title,
  images,
  chapters,
  tracks,
  trackIndex,
  expanded,
  isAdult,
  rjCode,
  t,
  onTrackChange,
  onExpandedChange,
  onClose,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [bufferedEnd, setBufferedEnd] = useState(0)
  const [showArt, setShowArt] = useState(true)
  const [imageIndex, setImageIndex] = useState(0)
  const [loadedImages, setLoadedImages] = useState<ReadonlySet<string>>(new Set())
  const [showChapterPanel, setShowChapterPanel] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [volume, setVolume] = useState(() => {
    const saved = parseFloat(localStorage.getItem('asmrVolume') || '')
    return Number.isFinite(saved) ? saved : 1
  })
  const volumeRef = useRef(volume)
  useEffect(() => {
    volumeRef.current = volume
  }, [volume])

  const sanitizedImages = useMemo(() => {
    const set = new Set<string>()
    const result: string[] = []
    for (const img of images) {
      if (!img || typeof img !== 'string') continue
      const isProxied = img.startsWith('/api/proxy')
      const proxied =
        !isProxied && (img.startsWith('http://') || img.startsWith('https://'))
          ? `/api/proxy?url=${encodeURIComponent(img)}&referer=${encodeURIComponent('https://japaneseasmr.com/')}`
          : img
      if (!set.has(proxied)) {
        set.add(proxied)
        result.push(proxied)
      }
    }
    return result
  }, [images])

  const track = tracks[trackIndex]
  const rawTrackLink = track?.link
  const isProxied = rawTrackLink?.startsWith('/api/proxy')
  const trackLink =
    rawTrackLink &&
    !isProxied &&
    (rawTrackLink.startsWith('http://') || rawTrackLink.startsWith('https://'))
      ? `/api/proxy?url=${encodeURIComponent(rawTrackLink)}&referer=${encodeURIComponent(track?.headers?.Referer || 'https://japaneseasmr.com/')}`
      : rawTrackLink
  const trackIsHls = track?.hls
  const hasImages = sanitizedImages.length > 0

  const destroyHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !trackLink) return

    setCurrentTime(0)
    setDuration(0)
    setBufferedEnd(0)
    setIsPlaying(false)
    destroyHls()

    const handleError = () => {
      const err = audio.error
      console.error('[AsmrPlayer] Audio error:', err?.code, err?.message, trackLink)
      setIsPlaying(false)
    }
    audio.addEventListener('error', handleError)

    audio.volume = volumeRef.current

    if (trackIsHls) {
      if (window.Hls && window.Hls.isSupported()) {
        const hls = new window.Hls({ enableWorker: true })
        hlsRef.current = hls
        hls.loadSource(trackLink)
        hls.attachMedia(audio)

        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          audio.play().catch((err) => {
            console.warn('[AsmrPlayer] Autoplay prevented:', err)
            setIsPlaying(false)
          })
        })

        hls.on(window.Hls.Events.LEVEL_LOADED, (_event: any, data: any) => {
          if (data?.details?.totalduration && Number.isFinite(data.details.totalduration)) {
            setDuration(data.details.totalduration)
          }
        })

        hls.on(window.Hls.Events.ERROR, (_event: any, data: any) => {
          console.warn('[AsmrPlayer] HLS error:', data?.type, data?.details, data?.fatal)
          if (data?.fatal) {
            console.error('[AsmrPlayer] Fatal HLS error encountered:', data)
            switch (data.type) {
              case window.Hls.ErrorTypes.NETWORK_ERROR:
                hls.startLoad()
                break
              case window.Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError()
                break
              default:
                destroyHls()
                break
            }
          }
        })
      } else {
        audio.src = trackLink
        audio.load()
        audio.play().catch(() => setIsPlaying(false))
      }
    } else {
      audio.src = trackLink
      audio.load()
      audio.play().catch(() => setIsPlaying(false))
    }

    return () => {
      audio.removeEventListener('error', handleError)
      destroyHls()
      audio.removeAttribute('src')
    }
  }, [trackLink, trackIsHls, destroyHls])

  useEffect(() => () => destroyHls(), [destroyHls])

  useEffect(() => {
    const audio = audioRef.current
    if (audio) audio.volume = volume
  }, [volume])

  useEffect(() => {
    if (!expanded) return
    document.body.classList.add('asmr-player-open')
    return () => document.body.classList.remove('asmr-player-open')
  }, [expanded])

  useEffect(() => {
    setImageIndex(0)
  }, [sanitizedImages])

  useEffect(() => {
    if (!expanded) return
    setShowControls(true)
  }, [expanded])

  useEffect(() => {
    if (showChapterPanel) setShowControls(true)
  }, [showChapterPanel])


  const handleImgLoad = useCallback((src: string) => {
    setLoadedImages((prev) => {
      if (prev.has(src)) return prev
      const next = new Set(prev)
      next.add(src)
      return next
    })
  }, [])

  const attachImgRef = useCallback(
    (el: HTMLImageElement | null, src: string) => {
      if (el && el.complete && el.naturalWidth > 0) handleImgLoad(src)
    },
    [handleImgLoad]
  )

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showChapterPanel) setShowChapterPanel(false)
        else onExpandedChange(false)
        return
      }
      if (!showArt || sanitizedImages.length < 2) return
      if (e.key === 'ArrowLeft') setImageIndex((i) => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setImageIndex((i) => Math.min(sanitizedImages.length - 1, i + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded, showArt, sanitizedImages.length, showChapterPanel, onExpandedChange])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      audio.play().catch(() => {})
    } else {
      audio.pause()
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current
    if (!audio || !duration) return
    const time = parseFloat(e.target.value)
    audio.currentTime = time
    setCurrentTime(time)
  }

  const handleEnded = () => {
    if (trackIndex < tracks.length - 1) {
      onTrackChange(trackIndex + 1)
    }
  }

  const activeChapter = chapters.reduce((acc, c, i) => (currentTime >= c.time ? i : acc), -1)

  const seekTo = (time: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = time
    setCurrentTime(time)
  }

  const seekBy = (delta: number) => {
    const audio = audioRef.current
    if (!audio) return
    const base = Number.isFinite(audio.currentTime) ? audio.currentTime : currentTime
    const target = Math.max(0, Math.min(duration || Infinity, base + delta))
    audio.currentTime = target
    setCurrentTime(target)
    setShowControls(true)
  }

  const playedPct = duration ? Math.min(100, (currentTime / duration) * 100) : 0
  const bufferedPct = duration
    ? Math.min(100, Math.max(playedPct, (bufferedEnd / duration) * 100))
    : 0

  const transportRow = (
    <>
      <div className={styles.playerButtons}>
        <button
          className={styles.playerBtn}
          onClick={() => onTrackChange(Math.max(0, trackIndex - 1))}
          disabled={trackIndex === 0}
          aria-label="Previous track"
        >
          <FaStepBackward />
        </button>
        <button
          className={`${styles.playerBtn} ${styles.seekBtn}`}
          onClick={() => seekBy(-10)}
          aria-label="Seek back 10 seconds"
          title="Back 10s"
        >
          <FaUndo />
          <span className={styles.seekBtnLabel}>10</span>
        </button>
        <button
          className={`${styles.playerBtn} ${styles.playBtn}`}
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <FaPause /> : <FaPlay />}
        </button>
        <button
          className={`${styles.playerBtn} ${styles.seekBtn}`}
          onClick={() => seekBy(10)}
          aria-label="Seek forward 10 seconds"
          title="Forward 10s"
        >
          <FaRedo />
          <span className={styles.seekBtnLabel}>10</span>
        </button>
        <button
          className={styles.playerBtn}
          onClick={() => onTrackChange(Math.min(tracks.length - 1, trackIndex + 1))}
          disabled={trackIndex >= tracks.length - 1}
          aria-label="Next track"
        >
          <FaStepForward />
        </button>
      </div>

      <div className={styles.seekRow}>
        <span className={styles.timeLabel}>{formatTime(currentTime)}</span>
        <input
          className={styles.seekBar}
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(currentTime, duration || 0)}
          onChange={handleSeek}
          style={
            {
              '--played-percent': `${playedPct}%`,
              '--buffered-percent': `${bufferedPct}%`,
            } as React.CSSProperties
          }
          aria-label="Seek"
        />
        <span className={styles.timeLabel}>{formatTime(duration)}</span>
      </div>
    </>
  )

  const barContent = (
    <>
      <button
        className={`${styles.playerBtn} ${styles.playerToggle}`}
        onClick={() => onExpandedChange(!expanded)}
        aria-label={expanded ? 'Minimize player' : 'Expand player'}
        title={expanded ? 'Minimize to browse' : 'Expand'}
      >
        {expanded ? <FaChevronDown /> : <FaChevronUp />}
      </button>

      <div className={styles.playerInfo}>
        <p className={styles.playerTitle} title={title}>
          {t ? t(title) : title}
        </p>
        <p className={styles.playerTrack}>
          {track?.resolutionStr || ''}
          {tracks.length > 1 ? ` (${trackIndex + 1}/${tracks.length})` : ''}
        </p>
      </div>

      <div className={styles.playerControls}>{transportRow}</div>

      <div className={styles.playerRight}>
        <FaVolumeUp className={styles.volumeIcon} />
        <input
          className={styles.volumeBar}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            setVolume(v)
            localStorage.setItem('asmrVolume', String(v))
          }}
          style={{ '--volume-percent': `${volume * 100}%` } as React.CSSProperties}
          aria-label="Volume"
        />
      </div>

      <div className={styles.playerActions}>
        {expanded && hasImages && (
          <button
            className={styles.playerBtn}
            onClick={() => setShowArt((v) => !v)}
            aria-label={showArt ? 'Hide images' : 'Show images'}
            title={showArt ? 'Hide images' : 'Show images'}
          >
            {showArt ? <FaEyeSlash /> : <FaImage />}
          </button>
        )}

        {expanded && chapters.length > 0 && (
          <button
            className={`${styles.playerBtn} ${showChapterPanel ? styles.playerBtnActive : ''}`}
            onClick={() => setShowChapterPanel((v) => !v)}
            aria-label={showChapterPanel ? 'Hide bookmarks' : 'Show bookmarks'}
            title="Timestamps"
          >
            <FaListOl />
          </button>
        )}

        <button className={styles.playerBtn} onClick={onClose} aria-label="Close player">
          <FaTimes />
        </button>
      </div>
    </>
  )

  const audioEl = (
    <audio
      ref={audioRef}
      preload="metadata"
      onPlay={() => setIsPlaying(true)}
      onPause={() => setIsPlaying(false)}
      onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
      onDurationChange={(e) => {
        const d = e.currentTarget.duration
        if (Number.isFinite(d) && d > 0) setDuration(d)
      }}
      onLoadedMetadata={(e) => {
        const d = e.currentTarget.duration
        if (Number.isFinite(d) && d > 0) setDuration(d)
      }}
      onProgress={(e) => {
        const a = e.currentTarget
        if (a.buffered.length > 0) setBufferedEnd(a.buffered.end(a.buffered.length - 1))
      }}
      onEnded={handleEnded}
    />
  )

  if (!expanded) {
    return createPortal(
      <>
        {audioEl}
        <div className={styles.playerBar}>{barContent}</div>
      </>,
      document.body
    )
  }

  const safeIndex = Math.min(imageIndex, Math.max(0, sanitizedImages.length - 1))
  const currentSrc = sanitizedImages[safeIndex]
  const currentPending = showArt && hasImages && !!currentSrc && !loadedImages.has(currentSrc)

  return createPortal(
    <>
      {audioEl}
      <div className={`${styles.npOverlay} ${!showControls ? styles.npOverlayControlsHidden : ''}`}>
        <div
          className={`${styles.npStage} ${!showArt || !hasImages ? styles.npStageBlank : ''}`}
          onClick={() => setShowControls((v) => !v)}
        >
          {showArt && hasImages && (
            <>
              <div className={styles.sliderViewport}>
                <div
                  className={styles.sliderTrack}
                  style={{ transform: `translateX(-${safeIndex * 100}%)` }}
                >
                  {sanitizedImages.map((src, idx) => (
                    <div key={`${src}-${idx}`} className={styles.slide}>
                      <img
                        ref={(el) => attachImgRef(el, src)}
                        src={src}
                        alt={`${t ? t(title) : title} — work image`}
                        draggable={false}
                        onLoad={() => handleImgLoad(src)}
                        onError={() => handleImgLoad(src)}
                        className={`${styles.slideImg} ${
                          loadedImages.has(src) ? styles.slideImgLoaded : ''
                        }`}
                      />
                    </div>
                  ))}
                </div>
                {currentPending && (
                  <span className={styles.slideSpinner} aria-label="Loading image" />
                )}
              </div>

              {sanitizedImages.length > 1 && (
                <>
                  <button
                    className={`${styles.npArrow} ${styles.npArrowLeft}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setImageIndex((i) => Math.max(0, i - 1))
                      setShowControls(true)
                    }}
                    disabled={safeIndex === 0}
                    aria-label="Previous image"
                  >
                    <FaChevronLeft />
                  </button>
                  <button
                    className={`${styles.npArrow} ${styles.npArrowRight}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setImageIndex((i) => Math.min(sanitizedImages.length - 1, i + 1))
                      setShowControls(true)
                    }}
                    disabled={safeIndex === sanitizedImages.length - 1}
                    aria-label="Next image"
                  >
                    <FaChevronRight />
                  </button>
                  <span className={styles.npImageCount} onClick={(e) => e.stopPropagation()}>
                    {safeIndex + 1} / {sanitizedImages.length}
                  </span>
                </>
              )}
            </>
          )}
        </div>

        <div
          className={`${styles.playerBar} ${styles.playerBarDocked} ${!showControls ? styles.playerBarDockedHidden : ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          {barContent}

          {showChapterPanel && (
            <>
              <div className={styles.npBackdrop} onClick={() => setShowChapterPanel(false)} />
              <div className={styles.chapterPanel}>
                {chapters.map((chapter, i) => (
                  <button
                    key={`${chapter.time}-${i}`}
                    className={`${styles.chapterRow} ${
                      i === activeChapter ? styles.chapterRowActive : ''
                    }`}
                    title={t ? t(chapter.label) : chapter.label}
                    onClick={() => {
                      seekTo(chapter.time)
                      setShowChapterPanel(false)
                    }}
                  >
                    <span className={styles.chapterRowTime}>{formatTime(chapter.time)}</span>
                    <span
                      className={styles.chapterRowLabel}
                      title={t ? t(chapter.label) : chapter.label}
                    >
                      {t ? t(chapter.label) : chapter.label}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>,
    document.body
  )
}

export default AsmrPlayer
