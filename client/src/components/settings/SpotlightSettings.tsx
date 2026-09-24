import React, { useState, useEffect } from 'react'
import { FaSlidersH, FaLayerGroup } from 'react-icons/fa'
import { useSpotlightSettings } from '../../hooks/useSpotlightSettings'
import styles from './SpotlightSettings.module.css'

interface SpotlightSettingsProps {
  mode?: 'server' | 'user'
}

export const SpotlightSettings: React.FC<SpotlightSettingsProps> = ({ mode = 'user' }) => {
  const {
    isModern,
    blur,
    serverStyle,
    serverBlur,
    hasUserOverride,
    setSpotlightStyle,
    setSpotlightBlur,
    setServerSpotlightStyle,
    setServerSpotlightBlur,
    resetToDefault,
  } = useSpotlightSettings()

  const isServer = mode === 'server'

  // Determine current active toggle state
  const currentChecked = isServer ? serverStyle === 'modern' : isModern
  const currentBlur = isServer ? serverBlur : blur

  // Local state for smooth slider dragging
  const [sliderVal, setSliderVal] = useState<number>(currentBlur)

  useEffect(() => {
    setSliderVal(currentBlur)
  }, [currentBlur])

  const handleToggle = (checked: boolean) => {
    const nextStyle = checked ? 'modern' : 'legacy'
    if (isServer) {
      setServerSpotlightStyle(nextStyle)
    } else {
      setSpotlightStyle(nextStyle)
    }
  }

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value)
    setSliderVal(val)
    document.documentElement.style.setProperty('--spotlight-blur', `${val}px`)
  }

  const handleSliderCommit = (e: React.SyntheticEvent<HTMLInputElement>) => {
    const val = Number((e.target as HTMLInputElement).value)
    if (isServer) {
      setServerSpotlightBlur(val)
    } else {
      setSpotlightBlur(val)
    }
  }

  return (
    <div className={styles.card} id="spotlight-settings-card">
      <div className={styles.cardHeader}>
        <div className={styles.titleArea}>
          <FaLayerGroup className={styles.titleIcon} />
          <h3 className={styles.title}>
            {isServer ? 'Spotlight Banner (Server Default)' : 'Spotlight Banner'}
          </h3>
        </div>
        <span className={`${styles.badge} ${currentChecked ? styles.badgeActive : ''}`}>
          {currentChecked ? 'Modern Spotlight' : 'Legacy Spotlight'}
        </span>
      </div>

      <p className={styles.subtitle}>
        {isServer
          ? 'Configure the server-wide default spotlight banner style and ambient blur level for the home page.'
          : 'Choose between the modern ambient hero banner and the classic card banner, with custom background blur.'}
      </p>

      <div className={styles.mainRow}>
        {/* Toggle Column */}
        <div className={styles.toggleCol}>
          <label className={styles.toggleWrapper} htmlFor="spotlight-style-toggle">
            <input
              type="checkbox"
              id="spotlight-style-toggle"
              className={styles.checkboxInput}
              checked={currentChecked}
              onChange={(e) => handleToggle(e.target.checked)}
            />
            <span className={styles.toggleLabelText}>Modern Ambient Spotlight</span>
          </label>
          <p className={styles.toggleHelp}>
            {currentChecked
              ? 'Full-width ambient hero banner with dynamic background artwork and story progress segments.'
              : 'Classic contained-card banner with carousel arrows, dots, and a countdown progress bar.'}
          </p>
        </div>

        {/* Conditional Slider Column (appears right next to checkbox when checked) */}
        {currentChecked && (
          <div className={styles.sliderCol} id="spotlight-blur-container">
            <div className={styles.sliderHeader}>
              <label htmlFor="spotlight-blur-slider" className={styles.sliderLabel}>
                <FaSlidersH />
                <span>Background Blur</span>
              </label>
              <span className={styles.sliderValueBadge}>{sliderVal}px</span>
            </div>

            <input
              type="range"
              id="spotlight-blur-slider"
              min="0"
              max="60"
              step="1"
              value={sliderVal}
              onChange={handleSliderChange}
              onMouseUp={handleSliderCommit}
              onTouchEnd={handleSliderCommit}
              onKeyUp={handleSliderCommit}
              className={styles.rangeInput}
              aria-label="Spotlight background blur level"
            />

            <div className={styles.sliderScale}>
              <span>0px (Crisp)</span>
              <span>28px (Default)</span>
              <span>60px (Frosted)</span>
            </div>

            {/* Live Visual Preview */}
            <div className={styles.previewBox} title={`Preview with ${sliderVal}px blur`}>
              <div
                className={styles.previewBg}
                style={{ filter: `blur(${sliderVal}px) saturate(1.35) brightness(0.65)` }}
              />
              <span className={styles.previewOverlay}>Live Blur Preview: {sliderVal}px</span>
            </div>
          </div>
        )}
      </div>

      {!isServer && hasUserOverride && (
        <div className={styles.cardFooter}>
          <button
            type="button"
            className={styles.resetBtn}
            onClick={resetToDefault}
            title="Revert back to server default spotlight settings"
          >
            Reset to Server Default ({serverStyle === 'modern' ? 'Modern' : 'Legacy'}, {serverBlur}px)
          </button>
        </div>
      )}
    </div>
  )
}

export default SpotlightSettings
