import React, { useState, useEffect } from 'react'
import { Button } from '../common/Button'
import { useSetting, useUpdateSetting } from '../../hooks/useSettings'
import toast from 'react-hot-toast'
import styles from './LocalMediaSettings.module.css'

const LocalMediaSettings: React.FC = () => {
  const updateSetting = useUpdateSetting()

  // Media Mode
  const { data: mediaModeSetting } = useSetting('media_mode')
  const [mediaMode, setMediaMode] = useState<string>('web')

  // Filter local only in mixed mode
  const { data: mixedFilterSetting } = useSetting('mixed_local_only_filter')
  const [mixedLocalOnly, setMixedLocalOnly] = useState<boolean>(false)

  // Shoko Connection
  const { data: shokoUrlSetting } = useSetting('shoko_url')
  const { data: shokoPortSetting } = useSetting('shoko_port')
  const { data: shokoApiKeySetting } = useSetting('shoko_api_key')
  const { data: hwaccelSetting } = useSetting('hwaccel_mode')

  const [shokoUrl, setShokoUrl] = useState<string>('http://localhost')
  const [shokoPort, setShokoPort] = useState<string>('8111')
  const [shokoApiKey, setShokoApiKey] = useState<string>('')
  const [hwaccel, setHwaccel] = useState<string>('auto')

  // Dual auth mode
  const [authMethod, setAuthMethod] = useState<'apikey' | 'login'>('apikey')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  // Test connection status
  const [testState, setTestState] = useState<{
    loading: boolean
    success?: boolean
    message?: string
  }>({ loading: false })

  // Anime DB status
  const [animeDbStatus, setAnimeDbStatus] = useState<{
    totalMapped: number
    isRefreshing: boolean
  }>({ totalMapped: 0, isRefreshing: false })
  const [refreshingDb, setRefreshingDb] = useState(false)

  useEffect(() => {
    if (mediaModeSetting !== undefined && mediaModeSetting !== null) {
      setMediaMode(String(mediaModeSetting))
    }
  }, [mediaModeSetting])

  useEffect(() => {
    if (mixedFilterSetting !== undefined && mixedFilterSetting !== null) {
      setMixedLocalOnly(mixedFilterSetting === 'true' || mixedFilterSetting === true)
    }
  }, [mixedFilterSetting])

  useEffect(() => {
    if (shokoUrlSetting) setShokoUrl(String(shokoUrlSetting))
  }, [shokoUrlSetting])

  useEffect(() => {
    if (shokoPortSetting) setShokoPort(String(shokoPortSetting))
  }, [shokoPortSetting])

  useEffect(() => {
    if (shokoApiKeySetting) setShokoApiKey(String(shokoApiKeySetting))
  }, [shokoApiKeySetting])

  useEffect(() => {
    if (hwaccelSetting) setHwaccel(String(hwaccelSetting))
  }, [hwaccelSetting])

  const fetchAnimeDbStatus = async () => {
    try {
      const res = await fetch('/api/shoko/anime-db-status')
      if (res.ok) {
        const data = await res.json()
        setAnimeDbStatus(data)
      }
    } catch {}
  }

  useEffect(() => {
    fetchAnimeDbStatus()
  }, [])

  const handleMediaModeChange = (newMode: string) => {
    setMediaMode(newMode)
    updateSetting.mutate({ key: 'media_mode', value: newMode })
  }

  const handleMixedFilterChange = (checked: boolean) => {
    setMixedLocalOnly(checked)
    updateSetting.mutate({ key: 'mixed_local_only_filter', value: String(checked) })
  }

  const handleSaveConnection = () => {
    updateSetting.mutate({ key: 'shoko_url', value: shokoUrl })
    updateSetting.mutate({ key: 'shoko_port', value: shokoPort })
    if (authMethod === 'apikey') {
      updateSetting.mutate({ key: 'shoko_api_key', value: shokoApiKey })
    }
    toast.success('Connection settings saved')
  }

  const handleTestConnection = async () => {
    setTestState({ loading: true })
    try {
      const params = new URLSearchParams({
        url: shokoUrl,
        port: shokoPort,
        apiKey: shokoApiKey,
      })
      const res = await fetch(`/api/shoko/test?${params.toString()}`)
      const data = await res.json()
      if (data.success) {
        setTestState({
          loading: false,
          success: true,
          message: `Connected successfully! Server: ${data.server || 'Shoko'} (${data.version || 'v5.x'})`,
        })
      } else {
        setTestState({
          loading: false,
          success: false,
          message: data.error || 'Failed to connect to Shoko Server',
        })
      }
    } catch (e) {
      setTestState({
        loading: false,
        success: false,
        message: (e as Error).message || 'Connection failed',
      })
    }
  }

  const handleLogin = async () => {
    if (!username || !password) {
      toast.error('Please enter username and password')
      return
    }

    setLoggingIn(true)
    try {
      const res = await fetch('/api/shoko/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: shokoUrl,
          port: parseInt(shokoPort, 10),
          username,
          password,
        }),
      })
      const data = await res.json()
      if (data.success && data.apiKey) {
        setShokoApiKey(data.apiKey)
        toast.success('Successfully logged into Shoko Server!')
        setTestState({
          loading: false,
          success: true,
          message: 'Authenticated and token saved!',
        })
      } else {
        toast.error(data.error || 'Login failed')
      }
    } catch (e) {
      toast.error((e as Error).message || 'Login request failed')
    } finally {
      setLoggingIn(false)
    }
  }

  const handleRefreshAnimeDb = async () => {
    setRefreshingDb(true)
    toast.loading('Downloading anime cross-reference database...', { id: 'animedb' })
    try {
      const res = await fetch('/api/shoko/refresh-anime-db', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        toast.success(`Anime database updated! ${data.count?.toLocaleString()} titles indexed`, {
          id: 'animedb',
        })
        fetchAnimeDbStatus()
      } else {
        toast.error(data.error || 'Failed to update anime database', { id: 'animedb' })
      }
    } catch (e) {
      toast.error('Failed to download anime database', { id: 'animedb' })
    } finally {
      setRefreshingDb(false)
    }
  }

  const handleHwaccelChange = (val: string) => {
    setHwaccel(val)
    updateSetting.mutate({ key: 'hwaccel_mode', value: val })
  }

  return (
    <div>
      {/* Playback Mode Section */}
      <div className={styles.sectionCard}>
        <h3 className={styles.title}>Media Playback Mode</h3>
        <p className={styles.subtitle}>
          Choose how Dango streams video content. Switch between web scrapers and your personal local Shoko Server library.
        </p>

        <div className={styles.formGroup}>
          <label className={styles.label}>Playback Mode</label>
          <div className={styles.inputWrapper}>
            <select
              className={styles.select}
              value={mediaMode}
              onChange={(e) => handleMediaModeChange(e.target.value)}
              id="media-mode-select"
            >
              <option value="web">Web Only (Default - Web scrapers)</option>
              <option value="mixed">Mixed (Local First, Web Fallback)</option>
              <option value="local">Local Only (Shoko VFS media exclusively)</option>
            </select>
          </div>
          <p className={styles.hint}>
            {mediaMode === 'web' && 'Current behavior: Streams exclusively via external web providers.'}
            {mediaMode === 'mixed' && 'Prioritizes local Shoko files. If an episode is missing, seamlessly falls back to web providers.'}
            {mediaMode === 'local' && 'Streams only files present on your local Shoko Server disk. Zero external streaming.'}
          </p>
        </div>

        {mediaMode === 'mixed' && (
          <label className={styles.checkboxRow} id="mixed-filter-row">
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={mixedLocalOnly}
              onChange={(e) => handleMixedFilterChange(e.target.checked)}
              id="mixed-local-filter-checkbox"
            />
            <div>
              <span className={styles.checkboxLabel}>Only show anime in local media library</span>
              <p className={styles.checkboxDesc}>
                In Mixed mode, limits discovery and search results strictly to anime series you own on Shoko Server, while still allowing missing episodes to fall back to web.
              </p>
            </div>
          </label>
        )}
      </div>

      {/* Shoko Server Connection */}
      <div className={styles.sectionCard}>
        <h3 className={styles.title}>Shoko Server Configuration</h3>
        <p className={styles.subtitle}>
          Configure connection to Shoko Server running on your server or Unraid network.
        </p>

        <div className={styles.gridTwo}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Shoko Server Host / URL</label>
            <input
              type="text"
              className={styles.input}
              value={shokoUrl}
              onChange={(e) => setShokoUrl(e.target.value)}
              placeholder="http://192.168.1.50 or http://localhost"
              id="shoko-url-input"
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Port</label>
            <input
              type="number"
              className={styles.input}
              value={shokoPort}
              onChange={(e) => setShokoPort(e.target.value)}
              placeholder="8111"
              id="shoko-port-input"
            />
          </div>
        </div>

        {/* Auth Method Selector */}
        <div className={styles.authTabs}>
          <button
            type="button"
            className={`${styles.authTabBtn} ${authMethod === 'apikey' ? styles.authTabBtnActive : ''}`}
            onClick={() => setAuthMethod('apikey')}
          >
            Pre-set API Key
          </button>
          <button
            type="button"
            className={`${styles.authTabBtn} ${authMethod === 'login' ? styles.authTabBtnActive : ''}`}
            onClick={() => setAuthMethod('login')}
          >
            Username & Password Login
          </button>
        </div>

        {authMethod === 'apikey' ? (
          <div className={styles.formGroup}>
            <label className={styles.label}>Shoko API Key</label>
            <div className={styles.inputWrapper}>
              <input
                type="password"
                className={styles.input}
                value={shokoApiKey}
                onChange={(e) => setShokoApiKey(e.target.value)}
                placeholder="Paste Shoko Server API key token"
                id="shoko-apikey-input"
              />
            </div>
            <p className={styles.hint}>
              Can also be provided via the SHOKO_API_KEY environment variable in Docker.
            </p>
          </div>
        ) : (
          <div className={styles.gridHalf} style={{ marginBottom: 'var(--space-4)' }}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Shoko Username</label>
              <input
                type="text"
                className={styles.input}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Default is often 'Default'"
                id="shoko-username-input"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Shoko Password</label>
              <input
                type="password"
                className={styles.input}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (leave blank if none)"
                id="shoko-password-input"
              />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
          <Button onClick={handleSaveConnection} id="save-shoko-settings-btn">
            Save Connection
          </Button>

          {authMethod === 'login' && (
            <Button
              onClick={handleLogin}
              disabled={loggingIn}
              id="login-shoko-btn"
            >
              {loggingIn ? 'Logging in...' : 'Login & Save Token'}
            </Button>
          )}

          <Button
            variant="secondary"
            onClick={handleTestConnection}
            disabled={testState.loading}
            id="test-shoko-btn"
          >
            {testState.loading ? 'Testing...' : 'Test Connection'}
          </Button>
        </div>

        {testState.message && (
          <div
            className={`${styles.statusBanner} ${
              testState.success ? styles.statusSuccess : styles.statusError
            }`}
          >
            <span>{testState.success ? '✓' : '✗'}</span>
            <span>{testState.message}</span>
          </div>
        )}
      </div>

      {/* Hardware Acceleration */}
      <div className={styles.sectionCard}>
        <h3 className={styles.title}>Hardware Acceleration & Remuxing</h3>
        <p className={styles.subtitle}>
          Controls how local MKV/MP4 files are remuxed or transcoded when streamed through the browser.
        </p>

        <div className={styles.formGroup}>
          <label className={styles.label}>Acceleration Engine</label>
          <div className={styles.inputWrapper}>
            <select
              className={styles.select}
              value={hwaccel}
              onChange={(e) => handleHwaccelChange(e.target.value)}
              id="hwaccel-select"
            >
              <option value="auto">Auto-detect (Recommended)</option>
              <option value="vaapi">Intel QuickSync (VAAPI - /dev/dri)</option>
              <option value="nvenc">NVIDIA NVENC</option>
              <option value="software">Software (CPU Transcode)</option>
            </select>
          </div>
          <p className={styles.hint}>
            Stream-copy remuxing (MKV → fMP4) runs at 0% CPU without re-encoding video. Hardware acceleration is utilized when downscaling or video transcoding is necessary.
          </p>
        </div>
      </div>

      {/* Anime Offline Database */}
      <div className={styles.sectionCard}>
        <h3 className={styles.title}>Anime Offline Database (AniDB ↔ AniList)</h3>
        <p className={styles.subtitle}>
          Manami Project cross-reference table that matches Shoko Server&apos;s AniDB library with AniList metadata.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ margin: 0, fontSize: 'var(--font-size-base)', fontWeight: 600 }}>
              {animeDbStatus.totalMapped > 0
                ? `${animeDbStatus.totalMapped.toLocaleString()} series indexed`
                : 'Not indexed yet'}
            </p>
            <p className={styles.hint}>
              Automatic weekly background updates keep mappings up to date with new seasonal releases.
            </p>
          </div>

          <Button
            variant="secondary"
            onClick={handleRefreshAnimeDb}
            disabled={refreshingDb}
            id="refresh-anime-db-btn"
          >
            {refreshingDb ? 'Updating...' : 'Refresh Database'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default LocalMediaSettings
