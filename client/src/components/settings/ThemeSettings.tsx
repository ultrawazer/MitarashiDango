import React, { useState, useMemo } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import type { Theme, CustomThemeInput } from '../../types/theme'
import { deriveThemeColors } from '../../utils/themeUtils'
import styles from './ThemeSettings.module.css'
import { FaPalette, FaCheck, FaPlus, FaEdit, FaTrash, FaSun, FaMoon, FaPlay } from 'react-icons/fa'
import toast from 'react-hot-toast'

export const ThemeSettings: React.FC = () => {
  const { themes, activeTheme, activeThemeId, setTheme, createTheme, updateTheme, deleteTheme } =
    useTheme()

  const [isStudioOpen, setIsStudioOpen] = useState(false)
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null)

  // Creator state
  const [themeName, setThemeName] = useState('')
  const [mode, setMode] = useState<'dark' | 'light'>('dark')
  const [bgMain, setBgMain] = useState('#050505')
  const [textPrimary, setTextPrimary] = useState('#ffffff')
  const [accentPrimary, setAccentPrimary] = useState('#CE8A4B')
  const [accentSecondary, setAccentSecondary] = useState('#E6BA79')

  const presetThemes = useMemo(() => themes.filter((t) => t.isPreset), [themes])
  const customThemes = useMemo(() => themes.filter((t) => !t.isPreset), [themes])

  // Live sandbox preview calculation
  const previewColors = useMemo(() => {
    return deriveThemeColors({
      name: themeName,
      mode,
      bgMain,
      textPrimary,
      accentPrimary,
      accentSecondary,
    })
  }, [themeName, mode, bgMain, textPrimary, accentPrimary, accentSecondary])

  const handleSelectTheme = (theme: Theme) => {
    setTheme(theme.id)
    toast.success(`Theme switched to ${theme.name}`)
  }

  const handleOpenCreate = () => {
    setEditingThemeId(null)
    setThemeName('')
    setMode('dark')
    setBgMain('#050505')
    setTextPrimary('#ffffff')
    setAccentPrimary('#CE8A4B')
    setAccentSecondary('#E6BA79')
    setIsStudioOpen(true)
  }

  const handleOpenEdit = (theme: Theme, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingThemeId(theme.id)
    setThemeName(theme.name)
    setMode(theme.mode)
    setBgMain(theme.colors.bgMain)
    setTextPrimary(theme.colors.textPrimary)
    setAccentPrimary(theme.colors.accentPrimary)
    setAccentSecondary(theme.colors.accentSecondary)
    setIsStudioOpen(true)
  }

  const handleDelete = (themeId: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (window.confirm(`Are you sure you want to delete the "${name}" theme?`)) {
      deleteTheme(themeId)
      toast.success(`Theme "${name}" deleted`)
      if (editingThemeId === themeId) {
        setIsStudioOpen(false)
        setEditingThemeId(null)
      }
    }
  }

  const handleSaveTheme = () => {
    const trimmed = themeName.trim()
    if (!trimmed) {
      toast.error('Please enter a theme name')
      return
    }

    const payload: CustomThemeInput = {
      name: trimmed,
      mode,
      bgMain,
      textPrimary,
      accentPrimary,
      accentSecondary,
    }

    if (editingThemeId) {
      updateTheme(editingThemeId, payload)
      toast.success(`Theme "${trimmed}" updated`)
    } else {
      createTheme(payload)
      toast.success(`Custom theme "${trimmed}" created & activated!`)
    }

    setIsStudioOpen(false)
    setEditingThemeId(null)
  }

  const handleCancelStudio = () => {
    setIsStudioOpen(false)
    setEditingThemeId(null)
  }

  const handleModeToggle = (selectedMode: 'dark' | 'light') => {
    setMode(selectedMode)
    if (selectedMode === 'light') {
      if (bgMain === '#050505' || bgMain.startsWith('#0')) setBgMain('#f8fafc')
      if (textPrimary === '#ffffff') setTextPrimary('#0f172a')
    } else {
      if (bgMain === '#f8fafc') setBgMain('#050505')
      if (textPrimary === '#0f172a') setTextPrimary('#ffffff')
    }
  }

  return (
    <div className={styles.container} id="themes-settings-container">
      {/* Active Theme Showcase */}
      <div className={styles.activeThemeBanner} id="active-theme-banner">
        <div className={styles.activeThemeInfo}>
          <span className={styles.activeLabel}>Current Active Theme</span>
          <h2 className={styles.activeThemeName}>{activeTheme.name}</h2>
        </div>
        <div className={styles.palettePreview}>
          <div className={styles.paletteChip} title="Primary Accent">
            <span
              className={styles.chipColorDot}
              style={{ backgroundColor: activeTheme.colors.accentPrimary }}
            />
            <span>Primary</span>
          </div>
          <div className={styles.paletteChip} title="Secondary Accent">
            <span
              className={styles.chipColorDot}
              style={{ backgroundColor: activeTheme.colors.accentSecondary }}
            />
            <span>Secondary</span>
          </div>
          <div className={styles.paletteChip} title="Canvas Background">
            <span
              className={styles.chipColorDot}
              style={{ backgroundColor: activeTheme.colors.bgMain }}
            />
            <span>Canvas</span>
          </div>
        </div>
      </div>

      {/* Preset Themes Section */}
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>
          <FaPalette /> Preset Themes
        </h3>
        <p className={styles.sectionSubtitle}>
          Handcrafted color palettes tailored for MitarashiDango's deep dark canvas. Click any
          theme to apply it immediately.
        </p>
      </div>

      <div className={styles.grid} id="preset-themes-grid">
        {presetThemes.map((theme) => {
          const isActive = theme.id === activeThemeId
          return (
            <button
              key={theme.id}
              id={`preset-theme-${theme.id}`}
              type="button"
              className={`${styles.themeCard} ${isActive ? styles.active : ''}`}
              onClick={() => handleSelectTheme(theme)}
            >
              {/* Mini UI Mockup */}
              <div
                className={styles.cardPreviewBox}
                style={{
                  backgroundColor: theme.colors.bgMain,
                  color: theme.colors.textPrimary,
                }}
              >
                <div className={styles.mockHeader}>
                  <div
                    className={styles.mockLogo}
                    style={{ backgroundColor: theme.colors.accentPrimary }}
                  />
                  <div
                    className={styles.mockAccentDot}
                    style={{ backgroundColor: theme.colors.accentSecondary }}
                  />
                </div>

                <div className={styles.mockContent}>
                  <div
                    className={styles.mockPoster}
                    style={{
                      backgroundColor: theme.colors.bgTertiary,
                      border: `1px solid ${theme.colors.accentPrimary}44`,
                    }}
                  />
                  <div className={styles.mockLines}>
                    <div
                      className={styles.mockLineTitle}
                      style={{ backgroundColor: theme.colors.textPrimary }}
                    />
                    <div
                      className={styles.mockLineSub}
                      style={{ backgroundColor: theme.colors.textSecondary }}
                    />
                    <div
                      className={styles.mockBadge}
                      style={{
                        backgroundColor: theme.colors.accentPrimary,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Card Footer Meta */}
              <div className={styles.cardMeta}>
                <span className={styles.themeCardName}>
                  {theme.name}
                  {isActive && (
                    <span className={styles.activeBadge}>
                      <FaCheck /> Active
                    </span>
                  )}
                </span>
                <div className={styles.colorSwatches}>
                  <span
                    className={styles.swatch}
                    style={{ backgroundColor: theme.colors.accentPrimary }}
                    title={`Primary Accent: ${theme.colors.accentPrimary}`}
                  />
                  <span
                    className={styles.swatch}
                    style={{ backgroundColor: theme.colors.accentSecondary }}
                    title={`Secondary Accent: ${theme.colors.accentSecondary}`}
                  />
                  <span
                    className={styles.swatch}
                    style={{ backgroundColor: theme.colors.bgMain }}
                    title={`Canvas: ${theme.colors.bgMain}`}
                  />
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Custom Themes Section */}
      {customThemes.length > 0 && (
        <>
          <div className={styles.sectionHeader} style={{ marginTop: '1rem' }}>
            <h3 className={styles.sectionTitle}>Custom Themes</h3>
            <p className={styles.sectionSubtitle}>
              User-generated themes created with the Theme Studio.
            </p>
          </div>

          <div className={styles.grid} id="custom-themes-grid">
            {customThemes.map((theme) => {
              const isActive = theme.id === activeThemeId
              return (
                <div
                  key={theme.id}
                  id={`custom-theme-${theme.id}`}
                  className={`${styles.themeCard} ${isActive ? styles.active : ''}`}
                  onClick={() => handleSelectTheme(theme)}
                >
                  <div
                    className={styles.cardPreviewBox}
                    style={{
                      backgroundColor: theme.colors.bgMain,
                      color: theme.colors.textPrimary,
                    }}
                  >
                    <div className={styles.mockHeader}>
                      <div
                        className={styles.mockLogo}
                        style={{ backgroundColor: theme.colors.accentPrimary }}
                      />
                      <div
                        className={styles.mockAccentDot}
                        style={{ backgroundColor: theme.colors.accentSecondary }}
                      />
                    </div>

                    <div className={styles.mockContent}>
                      <div
                        className={styles.mockPoster}
                        style={{
                          backgroundColor: theme.colors.bgTertiary,
                          border: `1px solid ${theme.colors.accentPrimary}44`,
                        }}
                      />
                      <div className={styles.mockLines}>
                        <div
                          className={styles.mockLineTitle}
                          style={{ backgroundColor: theme.colors.textPrimary }}
                        />
                        <div
                          className={styles.mockLineSub}
                          style={{ backgroundColor: theme.colors.textSecondary }}
                        />
                        <div
                          className={styles.mockBadge}
                          style={{ backgroundColor: theme.colors.accentPrimary }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className={styles.cardMeta}>
                    <span className={styles.themeCardName}>
                      {theme.name}
                      {isActive && (
                        <span className={styles.activeBadge}>
                          <FaCheck /> Active
                        </span>
                      )}
                    </span>
                    <div className={styles.colorSwatches}>
                      <span
                        className={styles.swatch}
                        style={{ backgroundColor: theme.colors.accentPrimary }}
                      />
                      <span
                        className={styles.swatch}
                        style={{ backgroundColor: theme.colors.accentSecondary }}
                      />
                    </div>
                  </div>

                  <div className={styles.customCardActions}>
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={(e) => handleOpenEdit(theme, e)}
                      title="Edit theme colors"
                    >
                      <FaEdit /> Edit
                    </button>
                    <button
                      type="button"
                      className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                      onClick={(e) => handleDelete(theme.id, theme.name, e)}
                      title="Delete custom theme"
                    >
                      <FaTrash /> Delete
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Theme Studio / Customizer */}
      <div className={styles.studioCard} id="theme-studio-section">
        <div className={styles.studioTop}>
          <div>
            <h3 className={styles.sectionTitle}>
              <FaPalette /> Theme Studio
            </h3>
            <p className={styles.sectionSubtitle}>
              Design custom color schemes with real-time preview and automatic surface shade
              generation.
            </p>
          </div>
          {!isStudioOpen && (
            <button
              type="button"
              id="open-theme-studio-btn"
              className={styles.createToggleBtn}
              onClick={handleOpenCreate}
            >
              <FaPlus /> Create Custom Theme
            </button>
          )}
        </div>

        {isStudioOpen && (
          <>
            <div className={styles.studioForm}>
              {/* Controls Column */}
              <div className={styles.controlsColumn}>
                <div className={styles.formGroup}>
                  <label htmlFor="theme-name-input">Theme Name</label>
                  <input
                    id="theme-name-input"
                    type="text"
                    className={styles.textInput}
                    placeholder="e.g. Midnight Amber"
                    value={themeName}
                    onChange={(e) => setThemeName(e.target.value)}
                    maxLength={32}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Display Mode</label>
                  <div className={styles.modeToggleGroup}>
                    <button
                      type="button"
                      className={`${styles.modeBtn} ${mode === 'dark' ? styles.active : ''}`}
                      onClick={() => handleModeToggle('dark')}
                    >
                      <FaMoon /> Dark Mode
                    </button>
                    <button
                      type="button"
                      className={`${styles.modeBtn} ${mode === 'light' ? styles.active : ''}`}
                      onClick={() => handleModeToggle('light')}
                    >
                      <FaSun /> Light Mode
                    </button>
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label>Anchor Colors</label>
                  <div className={styles.pickersGrid}>
                    <div className={styles.colorInputRow}>
                      <input
                        type="color"
                        id="color-picker-bg"
                        className={styles.colorPickerNative}
                        value={bgMain}
                        onChange={(e) => setBgMain(e.target.value)}
                      />
                      <div className={styles.colorPickerInfo}>
                        <span className={styles.colorPickerLabel}>Canvas Background</span>
                        <span className={styles.colorPickerHex}>{bgMain}</span>
                      </div>
                    </div>

                    <div className={styles.colorInputRow}>
                      <input
                        type="color"
                        id="color-picker-text"
                        className={styles.colorPickerNative}
                        value={textPrimary}
                        onChange={(e) => setTextPrimary(e.target.value)}
                      />
                      <div className={styles.colorPickerInfo}>
                        <span className={styles.colorPickerLabel}>Main Text</span>
                        <span className={styles.colorPickerHex}>{textPrimary}</span>
                      </div>
                    </div>

                    <div className={styles.colorInputRow}>
                      <input
                        type="color"
                        id="color-picker-accent1"
                        className={styles.colorPickerNative}
                        value={accentPrimary}
                        onChange={(e) => setAccentPrimary(e.target.value)}
                      />
                      <div className={styles.colorPickerInfo}>
                        <span className={styles.colorPickerLabel}>Primary Accent</span>
                        <span className={styles.colorPickerHex}>{accentPrimary}</span>
                      </div>
                    </div>

                    <div className={styles.colorInputRow}>
                      <input
                        type="color"
                        id="color-picker-accent2"
                        className={styles.colorPickerNative}
                        value={accentSecondary}
                        onChange={(e) => setAccentSecondary(e.target.value)}
                      />
                      <div className={styles.colorPickerInfo}>
                        <span className={styles.colorPickerLabel}>Secondary Accent</span>
                        <span className={styles.colorPickerHex}>{accentSecondary}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Live Preview Sandbox Column */}
              <div className={styles.previewColumn}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Live Preview Sandbox
                </label>
                <div
                  className={styles.sandboxContainer}
                  style={{
                    backgroundColor: previewColors.bgMain,
                    color: previewColors.textPrimary,
                  }}
                >
                  <div className={styles.sandboxHeader}>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                      {themeName.trim() || 'Theme Preview'}
                    </span>
                    <span
                      className={styles.sandboxBadge}
                      style={{
                        backgroundColor: previewColors.accentSecondary,
                        color: mode === 'light' ? '#ffffff' : '#050505',
                      }}
                    >
                      PREVIEW
                    </span>
                  </div>

                  <div
                    className={styles.sandboxCardMock}
                    style={{
                      backgroundColor: previewColors.bgPrimary,
                      border: `1px solid ${previewColors.bgTertiary}`,
                    }}
                  >
                    <div
                      className={styles.sandboxPoster}
                      style={{
                        backgroundColor: previewColors.accentPrimary,
                        color: '#ffffff',
                      }}
                    >
                      HD
                    </div>
                    <div className={styles.sandboxDetails}>
                      <h4
                        className={styles.sandboxTitle}
                        style={{ color: previewColors.textPrimary }}
                      >
                        Sample Anime Title
                      </h4>
                      <p
                        style={{
                          margin: 0,
                          fontSize: '0.8rem',
                          color: previewColors.textSecondary,
                        }}
                      >
                        Action · Fantasy · 24 Episodes
                      </p>
                      <button
                        type="button"
                        className={styles.sandboxBtn}
                        style={{
                          backgroundColor: previewColors.accentPrimary,
                          color: '#ffffff',
                        }}
                      >
                        <FaPlay style={{ marginRight: '0.35rem', fontSize: '0.7rem' }} /> Watch Now
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.studioActions}>
              <button
                type="button"
                id="cancel-theme-studio-btn"
                className={styles.cancelBtn}
                onClick={handleCancelStudio}
              >
                Cancel
              </button>
              <button
                type="button"
                id="save-theme-studio-btn"
                className={styles.saveBtn}
                onClick={handleSaveTheme}
                disabled={!themeName.trim()}
              >
                {editingThemeId ? 'Update Theme' : 'Save & Apply Theme'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default ThemeSettings
