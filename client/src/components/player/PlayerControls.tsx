import React, { useEffect, useState, Suspense, lazy } from 'react'
import styles from './PlayerControls.module.css'
import {
  FaPlay,
  FaPause,
  FaVolumeUp,
  FaVolumeMute,
  FaVolumeDown,
  FaVolumeOff,
  FaExpand,
  FaCompress,
  FaCog,
  FaTv,
  FaChevronLeft,
  FaForward,
  FaClosedCaptioning,
} from 'react-icons/fa'
import { MdReplay10, MdForward10 } from 'react-icons/md'
import type { VideoSource, VideoLink, SkipInterval } from '../../types/player'
import type useVideoPlayer from '../../hooks/useVideoPlayer'

const PlayerSettings = lazy(() => import('./PlayerSettings'))

interface PlayerControlsProps {
  player: ReturnType<typeof useVideoPlayer>
  isAutoplayEnabled: boolean
  onAutoplayChange: (checked: boolean) => void
  showNextEpisodeButton: boolean
  onNextEpisode: () => void
  videoSources: VideoSource[]
  selectedSource: VideoSource | null
  selectedLink: VideoLink | null
  onSourceChange: (source: VideoSource, link: VideoLink) => void
  loadingVideo: boolean
  skipIntervals: SkipInterval[]
  animeTitle: string
  episodeNumber: string | undefined
  isTheaterMode: boolean
  onTheaterModeToggle: () => void
  selectedAudioTrackIndex?: number
  onAudioTrackChange?: (index: number) => void
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
  actualStreamStartTime?: number | null
}

const PlayerControls: React.FC<PlayerControlsProps> = ({
  player,
  isAutoplayEnabled,
  onAutoplayChange,
  showNextEpisodeButton,
  onNextEpisode,
  videoSources,
  selectedSource,
  selectedLink,
  onSourceChange,
  loadingVideo,
  skipIntervals,
  animeTitle,
  episodeNumber,
  isTheaterMode,
  onTheaterModeToggle,
  selectedAudioTrackIndex,
  onAudioTrackChange,
  anime4kEnabled,
  onAnime4kToggle,
  anime4kSupported,
  anime4kProfile,
  onAnime4kProfileChange,
  anime4kInitializing,
  anime4kError,
  anime4kZeroCopy,
  onAnime4kZeroCopyToggle,
  avSyncDelay,
  onAvSyncDelayChange,
  onOpenAvSyncCalibrator,
  actualStreamStartTime,
}) => {
  const { state, refs, actions } = player
  const { showSettings, showVolumeSlider } = state
  const { setShowSettings, setShowVolumeSlider } = actions

  const getEffDuration = (dur: number, srcDur?: number) => {
    if (srcDur && srcDur > 60) {
      if (!dur || dur < 30 || dur < srcDur * 0.5) return srcDur
    }
    return dur > 0 ? dur : (srcDur || 0)
  }

  const streamStartTime = React.useMemo(() => {
    if (actualStreamStartTime !== undefined && actualStreamStartTime !== null) {
      return actualStreamStartTime
    }
    if (!selectedLink?.link) return 0
    try {
      const search = selectedLink.link.includes('?') ? selectedLink.link.split('?')[1] : ''
      const params = new URLSearchParams(search)
      const st = params.get('startTime')
      return st ? parseFloat(st) || 0 : 0
    } catch {
      return 0
    }
  }, [actualStreamStartTime, selectedLink?.link])

  const effectiveDuration = getEffDuration(state.duration, selectedSource?.duration)

  const settingsRef = React.useRef<HTMLDivElement>(null)
  const settingsBtnRef = React.useRef<HTMLButtonElement>(null)
  const volumeRef = React.useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        settingsRef.current &&
        !settingsRef.current.contains(event.target as Node) &&
        settingsBtnRef.current &&
        !settingsBtnRef.current.contains(event.target as Node) &&
        showSettings
      ) {
        setShowSettings(false)
      }

      if (
        volumeRef.current &&
        !volumeRef.current.contains(event.target as Node) &&
        showVolumeSlider
      ) {
        setShowVolumeSlider(false)
      }
    }

    if (showSettings || showVolumeSlider) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showSettings, showVolumeSlider, setShowSettings, setShowVolumeSlider])

  const watchedBarRef = React.useRef<HTMLDivElement>(null)
  const thumbRef = React.useRef<HTMLDivElement>(null)
  const bufferedBarRef = React.useRef<HTMLDivElement>(null)
  const timeDisplayRef = React.useRef<HTMLSpanElement>(null)

  const currentTimeRef = React.useRef(0)

  useEffect(() => {
    const video = refs.videoRef.current
    if (!video) return

    const effDuration = getEffDuration(state.duration, selectedSource?.duration)

    const handleTimeUpdate = () => {
      if (!state.isScrubbing) {
        const time = streamStartTime + video.currentTime
        currentTimeRef.current = time
        const percent = effDuration > 0 ? (time / effDuration) * 100 : 0
        if (watchedBarRef.current) watchedBarRef.current.style.width = `${percent}%`
        if (thumbRef.current) thumbRef.current.style.left = `${percent}%`
        if (timeDisplayRef.current) {
          timeDisplayRef.current.innerText = `${actions.formatTime(time)} / ${actions.formatTime(effDuration)}`
        }
      }
    }

    const handleProgress = () => {
      if (video.buffered.length > 0 && effDuration > 0) {
        const bufferedEnd = streamStartTime + video.buffered.end(video.buffered.length - 1)
        const percent = (bufferedEnd / effDuration) * 100 || 0
        if (bufferedBarRef.current) bufferedBarRef.current.style.width = `${percent}%`
      }
    }

    handleTimeUpdate()
    handleProgress()

    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('progress', handleProgress)

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('progress', handleProgress)
    }
  }, [refs.videoRef, state.isScrubbing, state.duration, selectedSource?.duration, streamStartTime, actions])

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!refs.videoRef.current) return
    const newVolume = parseFloat(e.target.value)
    refs.videoRef.current.volume = newVolume
    refs.videoRef.current.muted = newVolume === 0
    localStorage.setItem('playerVolume', newVolume.toString())
  }

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const effDuration = getEffDuration(state.duration, selectedSource?.duration)
    if (
      !refs.videoRef.current ||
      !refs.progressBarRef.current ||
      isNaN(effDuration) ||
      effDuration === 0
    )
      return
    const rect = refs.progressBarRef.current.getBoundingClientRect()
    const percent = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const targetTime = percent * effDuration

    if (selectedSource?.isLocal && selectedLink) {
      const video = refs.videoRef.current
      if (!video) return

      // Direct VFS stream check: if native file has full seekable duration and streamStartTime is 0,
      // browser natively seeks anywhere in the file without restarting the HTTP connection!
      const isDirectNativeSeekable =
        streamStartTime === 0 &&
        !selectedLink.link.includes('audioIndex=') &&
        !selectedLink.link.includes('startTime=') &&
        Number.isFinite(video.duration) &&
        video.duration > 0 &&
        video.seekable.length > 0 &&
        video.seekable.end(video.seekable.length - 1) >= video.duration - 2

      if (isDirectNativeSeekable) {
        video.currentTime = targetTime
        actions.sendProgressUpdate(false, true)
        return
      }

      const streamRelativeTarget = targetTime - streamStartTime
      let isBuffered = false
      if (streamRelativeTarget >= 0) {
        for (let i = 0; i < video.buffered.length; i++) {
          if (streamRelativeTarget >= video.buffered.start(i) && streamRelativeTarget <= video.buffered.end(i)) {
            isBuffered = true
            break
          }
        }
      }

      if (isBuffered) {
        video.currentTime = streamRelativeTarget
        actions.sendProgressUpdate(false, true)
        return
      }

      const baseLink = selectedLink.link.split('?')[0]
      const search = selectedLink.link.includes('?') ? selectedLink.link.split('?')[1] : ''
      const params = new URLSearchParams(search)
      params.set('startTime', String(Math.round(targetTime * 1000) / 1000))
      const newLinkUrl = `${baseLink}?${params.toString()}`
      onSourceChange(selectedSource, {
        ...selectedLink,
        link: newLinkUrl,
      })
      return
    }

    refs.videoRef.current.currentTime = targetTime
    actions.sendProgressUpdate(false, true)
  }

  const handleProgressBarMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const effDuration = getEffDuration(state.duration, selectedSource?.duration)
    if (!refs.progressBarRef.current || !effDuration) return
    const rect = refs.progressBarRef.current.getBoundingClientRect()
    const percent = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const time = percent * effDuration
    actions.setHoverTime({ time, position: e.clientX - rect.left })
  }

  const handleThumbMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (!refs.videoRef.current) return
    actions.setIsScrubbing(true)
    actions.wasPlayingBeforeScrub.current = !refs.videoRef.current.paused
    refs.videoRef.current.pause()
  }

  const handleSubtitleSelection = (trackId: string | null) => {
    if (!refs.videoRef.current) return
    actions.setActiveSubtitleTrack(trackId)
    let matched = false
    Array.from(refs.videoRef.current.textTracks).forEach((track) => {
      const isMatch =
        trackId !== null &&
        trackId !== 'off' &&
        (track.language === trackId || track.label === trackId)
      const shouldShow = isMatch && !matched
      track.mode = shouldShow ? 'showing' : 'hidden'
      if (shouldShow) matched = true
    })
  }

  const isSubtitleActive = state.activeSubtitleTrack !== null && state.activeSubtitleTrack !== 'off'

  const handleCCToggle = () => {
    if (!refs.videoRef.current) return
    if (isSubtitleActive) {
      handleSubtitleSelection('off')
      localStorage.setItem('playerSubtitlesEnabled', 'false')
      return
    }
    if (state.availableSubtitles.length === 0) return
    const englishTrack = state.availableSubtitles.find(
      (t) => t.lang === 'en' || t.label === 'English'
    )
    const trackToActivate = englishTrack || state.availableSubtitles[0]
    handleSubtitleSelection(trackToActivate.label || trackToActivate.lang)
    localStorage.setItem('playerSubtitlesEnabled', 'true')
  }

  const renderVolumeIcon = () => {
    if (state.isMuted) return <FaVolumeMute />
    if (state.volume === 0) return <FaVolumeOff />
    if (state.volume < 0.5) return <FaVolumeDown />
    return <FaVolumeUp />
  }

  useEffect(() => {
    const handleDocumentMouseMove = (e: MouseEvent) => {
      const effDuration = getEffDuration(state.duration, selectedSource?.duration)
      if (
        !state.isScrubbing ||
        !refs.videoRef.current ||
        !refs.progressBarRef.current ||
        !effDuration
      )
        return
      const rect = refs.progressBarRef.current.getBoundingClientRect()
      const percent = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
      const scrubTime = percent * effDuration
      const percent100 = (scrubTime / effDuration) * 100 || 0
      if (watchedBarRef.current) watchedBarRef.current.style.width = `${percent100}%`
      if (thumbRef.current) thumbRef.current.style.left = `${percent100}%`
      if (timeDisplayRef.current) {
        timeDisplayRef.current.innerText = `${actions.formatTime(scrubTime)} / ${actions.formatTime(effDuration)}`
      }
      actions.setHoverTime({ time: scrubTime, position: e.clientX - rect.left })
    }

    const handleDocumentMouseUp = (e: MouseEvent) => {
      if (state.isScrubbing) {
        actions.setIsScrubbing(false)
        actions.setHoverTime({ time: 0, position: null })

        const effDuration = getEffDuration(state.duration, selectedSource?.duration)
        if (refs.progressBarRef.current && effDuration > 0) {
          const rect = refs.progressBarRef.current.getBoundingClientRect()
          const percent = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
          const targetTime = percent * effDuration

          if (selectedSource?.isLocal && selectedLink) {
            const video = refs.videoRef.current
            if (!video) return

            const isDirectNativeSeekable =
              streamStartTime === 0 &&
              !selectedLink.link.includes('audioIndex=') &&
              !selectedLink.link.includes('startTime=') &&
              Number.isFinite(video.duration) &&
              video.duration > 0 &&
              video.seekable.length > 0 &&
              video.seekable.end(video.seekable.length - 1) >= video.duration - 2

            if (isDirectNativeSeekable) {
              video.currentTime = targetTime
              actions.sendProgressUpdate(false, true)
              return
            }

            const streamRelativeTarget = targetTime - streamStartTime
            let isBuffered = false
            if (streamRelativeTarget >= 0) {
              for (let i = 0; i < video.buffered.length; i++) {
                if (streamRelativeTarget >= video.buffered.start(i) && streamRelativeTarget <= video.buffered.end(i)) {
                  isBuffered = true
                  break
                }
              }
            }

            if (isBuffered) {
              video.currentTime = streamRelativeTarget
              actions.sendProgressUpdate(false, true)
            } else {
              const baseLink = selectedLink.link.split('?')[0]
              const search = selectedLink.link.includes('?') ? selectedLink.link.split('?')[1] : ''
              const params = new URLSearchParams(search)
              params.set('startTime', String(Math.round(targetTime * 1000) / 1000))
              const newLinkUrl = `${baseLink}?${params.toString()}`
              onSourceChange(selectedSource, {
                ...selectedLink,
                link: newLinkUrl,
              })
            }
          } else if (refs.videoRef.current) {
            refs.videoRef.current.currentTime = targetTime
            actions.sendProgressUpdate(false, true)
          }
        }

        if (actions.wasPlayingBeforeScrub.current) {
          refs.videoRef.current?.play()
        }
      }
    }

    document.addEventListener('mousemove', handleDocumentMouseMove)
    document.addEventListener('mouseup', handleDocumentMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleDocumentMouseMove)
      document.removeEventListener('mouseup', handleDocumentMouseUp)
    }
  }, [state.isScrubbing, state.duration, selectedSource?.duration, selectedSource?.isLocal, selectedLink, streamStartTime, refs.videoRef, refs.progressBarRef, actions, onSourceChange])

  return (
    <div
      className={`${styles.controlsOverlay} ${!state.showControls && !showSettings && !showVolumeSlider && !state.isScrubbing ? styles.hidden : ''} `}
      data-speed-boost-ignore="true"
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {/* Netflix Style Top Bar Overlay */}
      <div className={styles.topControls} onClick={(e) => e.stopPropagation()}>
        <button
          className={styles.backBtn}
          onClick={(e) => {
            e.stopPropagation()
            window.history.back()
          }}
          title="Back"
          aria-label="Back"
        >
          <FaChevronLeft />
        </button>
        <div className={styles.videoTitleInfo}>
          <span className={styles.animeTitle}>{animeTitle}</span>
          {episodeNumber && <span className={styles.episodeNumber}>Episode {episodeNumber}</span>}
        </div>
      </div>

      <div className={styles.centerControls} onClick={(e) => e.stopPropagation()}>
        <button
          className={styles.centerSkipBtn}
          onClick={() => actions.seek(-10)}
          title="Skip back 10s"
          aria-label="Skip back 10 seconds"
        >
          <MdReplay10 />
        </button>
        <button
          className={styles.centerPlayPause}
          data-speed-boost-ignore="true"
          onClick={actions.togglePlay}
          aria-label={state.isPlaying ? 'Pause' : 'Play'}
        >
          {state.isPlaying ? <FaPause /> : <FaPlay className={styles.playIconOffset} />}
        </button>
        <button
          className={styles.centerSkipBtn}
          onClick={() => actions.seek(10)}
          title="Skip forward 10s"
          aria-label="Skip forward 10 seconds"
        >
          <MdForward10 />
        </button>
      </div>

      <div
        className={styles.bottomControls}
        data-speed-boost-ignore="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`${styles.progressBarContainer} ${state.isScrubbing ? styles.scrubbing : ''} `}
          ref={refs.progressBarRef}
          onClick={handleProgressBarClick}
          onMouseMove={handleProgressBarMouseMove}
          onMouseLeave={() => actions.setHoverTime({ time: 0, position: null })}
        >
          {state.hoverTime.position !== null && (
            <div className={styles.timeBubble} style={{ left: state.hoverTime.position }}>
              {actions.formatTime(state.hoverTime.time)}
            </div>
          )}
          <div className={styles.progressBar}>
            {effectiveDuration > 0 && player.state.currentSkipInterval && (
              <div
                className={`${styles.skipSegment} ${styles[player.state.currentSkipInterval.skip_type]} `}
                style={{
                  left: `${(player.state.currentSkipInterval.start_time / effectiveDuration) * 100}% `,
                  width: `${((player.state.currentSkipInterval.end_time - player.state.currentSkipInterval.start_time) / effectiveDuration) * 100}% `,
                }}
              ></div>
            )}
            <div className={styles.bufferedBar} ref={bufferedBarRef}></div>
            <div className={styles.watchedBar} ref={watchedBarRef}></div>
            <div className={styles.thumb} ref={thumbRef} onMouseDown={handleThumbMouseDown}></div>

            {skipIntervals.map((interval) => {
              const startPercent = effectiveDuration > 0 ? (interval.start_time / effectiveDuration) * 100 : 0
              const widthPercent =
                effectiveDuration > 0 ? ((interval.end_time - interval.start_time) / effectiveDuration) * 100 : 0
              return (
                <div
                  key={interval.skip_id}
                  className={`${styles.skipSegment} ${styles[interval.skip_type]} `}
                  style={{ left: `${startPercent}% `, width: `${widthPercent}% ` }}
                  title={interval.skip_type.toUpperCase()}
                />
              )
            })}
          </div>
        </div>

        <div className={styles.bottomControlsRow}>
          <div className={styles.leftControls}>
            <button
              className={styles.controlBtn}
              onClick={actions.togglePlay}
              aria-label={state.isPlaying ? 'Pause' : 'Play'}
            >
              {state.isPlaying ? <FaPause /> : <FaPlay />}
            </button>

            <div
              className={`${styles.volumeContainer} ${showVolumeSlider ? styles.visible : ''}`}
              ref={volumeRef}
            >
              <button
                className={styles.controlBtn}
                onClick={(e) => {
                  e.stopPropagation()
                  if (window.innerWidth <= 768) {
                    setShowVolumeSlider(!showVolumeSlider)
                  } else {
                    actions.toggleMute()
                  }
                }}
                aria-label={state.isMuted ? 'Unmute' : 'Mute'}
              >
                {renderVolumeIcon()}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={state.isMuted ? 0 : state.volume}
                onChange={handleVolumeChange}
                className={styles.volumeSlider}
                style={
                  {
                    '--volume-percent': `${(state.isMuted ? 0 : state.volume) * 100}% `,
                  } as React.CSSProperties
                }
              />
            </div>

            <span className={styles.timeDisplay} ref={timeDisplayRef}>
              {actions.formatTime(currentTimeRef.current)} / {actions.formatTime(effectiveDuration)}
            </span>

            {state.currentSkipInterval && !state.isAutoSkipEnabled && (
              <button
                className={styles.controlBtn}
                onClick={() => {
                  if (refs.videoRef.current && state.currentSkipInterval) {
                    refs.videoRef.current.currentTime = state.currentSkipInterval.end_time
                    actions.setCurrentSkipInterval(null)
                  }
                }}
              >
                Skip {state.currentSkipInterval.skip_type === 'op' ? 'Opening' : 'Ending'}
              </button>
            )}
          </div>

          <div className={styles.rightControls}>
            <div className={styles.skipControls}>
              {showNextEpisodeButton && (
                <button
                  className={styles.nextEpisodeBtn}
                  onClick={onNextEpisode}
                  title="Play next episode"
                >
                  Next EP
                </button>
              )}
            </div>

            <button
              className={`${styles.controlBtn} ${isSubtitleActive ? styles.active : ''}`}
              onClick={handleCCToggle}
              title={isSubtitleActive ? 'Disable Subtitles' : 'Enable Subtitles'}
              aria-label="Toggle Subtitles"
            >
              <FaClosedCaptioning size={22} />
            </button>

            <button
              ref={settingsBtnRef}
              className={`${styles.controlBtn} ${showSettings ? styles.active : ''} `}
              onClick={() => setShowSettings(!showSettings)}
              aria-label="Settings"
            >
              <FaCog />
            </button>

            <button
              className={`${styles.controlBtn} ${isTheaterMode ? styles.active : ''} `}
              onClick={(e) => {
                e.stopPropagation()
                onTheaterModeToggle()
              }}
              title={isTheaterMode ? 'Exit Theater Mode' : 'Theater Mode'}
              aria-label={isTheaterMode ? 'Exit Theater Mode' : 'Theater Mode'}
            >
              <FaTv />
            </button>

            <button
              className={styles.controlBtn}
              onClick={actions.toggleFullscreen}
              aria-label={state.isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {state.isFullscreen ? <FaCompress /> : <FaExpand />}
            </button>
          </div>
        </div>
      </div>

      <Suspense fallback={null}>
        <PlayerSettings
          ref={settingsRef}
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          videoSources={videoSources}
          currentSource={selectedSource}
          currentLink={selectedLink}
          onSourceChange={onSourceChange}
          subtitles={state.availableSubtitles}
          activeSubtitleTrack={state.activeSubtitleTrack}
          onSubtitleChange={handleSubtitleSelection}
          selectedAudioTrackIndex={selectedAudioTrackIndex}
          onAudioTrackChange={onAudioTrackChange}
          subtitleSettings={{
            fontSize: state.subtitleFontSize,
            position: state.subtitlePosition,
          }}
          onSubtitleSettingsChange={(key, value) => {
            if (key === 'fontSize') {
              actions.setSubtitleFontSize(value)
              localStorage.setItem('subtitleFontSize', value.toString())
            } else {
              actions.setSubtitlePosition(value)
              localStorage.setItem('subtitlePosition', value.toString())
            }
          }}
          useNativeControls={state.useNativeControls}
          onNativeControlsToggle={actions.setUseNativeControls}
          anime4kEnabled={anime4kEnabled}
          onAnime4kToggle={onAnime4kToggle}
          anime4kSupported={anime4kSupported}
          anime4kProfile={anime4kProfile}
          onAnime4kProfileChange={onAnime4kProfileChange}
          anime4kInitializing={anime4kInitializing}
          anime4kError={anime4kError}
          anime4kZeroCopy={anime4kZeroCopy}
          onAnime4kZeroCopyToggle={onAnime4kZeroCopyToggle}
          avSyncDelay={avSyncDelay}
          onAvSyncDelayChange={onAvSyncDelayChange}
          onOpenAvSyncCalibrator={onOpenAvSyncCalibrator}
          isAutoSkipEnabled={state.isAutoSkipEnabled}
          onAutoSkipChange={(value) => {
            actions.setIsAutoSkipEnabled(value)
            try {
              localStorage.setItem('autoSkipEnabled', value.toString())
            } catch {
              // ignore
            }
          }}
          isAutoplayEnabled={isAutoplayEnabled}
          onAutoplayChange={onAutoplayChange}
        />
      </Suspense>
    </div>
  )
}

export default PlayerControls
