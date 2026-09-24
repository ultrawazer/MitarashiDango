import React, { useState, useRef, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router'
import { Button } from '../components/common/Button'
import TitlePreferenceToggle from '../components/common/TitlePreferenceToggle'
import styles from './Settings.module.css'
import GitHubSyncSettings from '../components/settings/GitHubSyncSettings'
import GoogleAuthSettings from '../components/settings/GoogleAuthSettings'
import RcloneSettings from '../components/settings/RcloneSettings'
import SyncProviderSelector from '../components/settings/SyncProviderSelector'
import { FaCog, FaCloud, FaDatabase, FaServer, FaPuzzlePiece, FaPalette, FaUsers } from 'react-icons/fa'
import LocalMediaSettings from '../components/settings/LocalMediaSettings'
import OfflineDbSettings from '../components/settings/OfflineDbSettings'
import ExtensionsSettings from '../components/settings/ExtensionsSettings'
import FlareSolverrSettings from '../components/settings/FlareSolverrSettings'
import ThemeSettings from '../components/settings/ThemeSettings'
import AdminUserManagement from '../components/settings/AdminUserManagement'
import { useLowEndMode } from '../contexts/LowEndModeContext'
import { useAuth } from '../contexts/AuthContext'
import ToggleSwitch from '../components/common/ToggleSwitch'
import {
  getVirtualKeyboardEnabled,
  VIRTUAL_KEYBOARD_ENABLED_CHANGE_EVENT,
  VIRTUAL_KEYBOARD_ENABLED_KEY,
} from '../hooks/useVirtualKeyboard'
import { useSystemNotifications } from '../hooks/useAnimeData'

type SettingsTab = 'general' | 'users' | 'themes' | 'appearance' | 'local-media' | 'extensions' | 'sync' | 'database'

const VALID_TABS: SettingsTab[] = ['general', 'users', 'themes', 'appearance', 'local-media', 'extensions', 'sync', 'database']

const Settings: React.FC = () => {
  const { isAdmin, isLoading: isAuthLoading } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const initialTab = searchParams.get('tab') as SettingsTab | null
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    initialTab && VALID_TABS.includes(initialTab)
      ? initialTab === 'appearance' ? 'themes' : initialTab
      : 'general'
  )
  const [statusMessage, setStatusMessage] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { lowEndMode, setLowEndMode } = useLowEndMode()
  const { data: systemNotifications = [] } = useSystemNotifications()
  const hasExtensionUpdates = systemNotifications.some((sn) => sn.id === 'system-extension-updates')

  useEffect(() => {
    if (!isAuthLoading && !isAdmin) {
      navigate('/user-settings', { replace: true })
    }
  }, [isAdmin, isAuthLoading, navigate])

  const [virtualKeyboardEnabled, setVirtualKeyboardEnabled] = useState(getVirtualKeyboardEnabled)



  const toggleVirtualKeyboard = (enabled: boolean) => {
    setVirtualKeyboardEnabled(enabled)
    localStorage.setItem(VIRTUAL_KEYBOARD_ENABLED_KEY, String(enabled))
    window.dispatchEvent(new CustomEvent(VIRTUAL_KEYBOARD_ENABLED_CHANGE_EVENT))
  }

  React.useEffect(() => {
    document.title = 'Admin Settings - dango'
  }, [])

  React.useEffect(() => {
    const tab = searchParams.get('tab') as SettingsTab | null
    if (tab && VALID_TABS.includes(tab)) {
      setActiveTab(tab)
    }
  }, [searchParams])

  const selectTab = (tab: SettingsTab) => {
    setActiveTab(tab)
    setSearchParams(tab === 'general' ? {} : { tab })
  }

  const handleBackup = () => {
    setStatusMessage('Downloading database backup...')
    const a = document.createElement('a')
    a.href = '/api/backup-db'
    a.download = 'dango-backup.db'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => {
      setStatusMessage('Database backup downloaded!')
    }, 1500)
  }

  const handleRestore = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setStatusMessage('Restoring database...')
    const formData = new FormData()
    formData.append('dbfile', file)

    try {
      const response = await fetch('/api/restore-db', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (response.ok) {
        setStatusMessage(result.message || 'Database restored successfully!')
        setTimeout(() => window.location.reload(), 2000)
      } else {
        setStatusMessage(`Restore failed: ${result.error}`)
      }
    } catch (_error) {
      setStatusMessage('Restore failed: An unexpected error occurred.')
    }
  }

  const triggerFileSelect = () => {
    fileInputRef.current?.click()
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <div className={styles.tabContent}>
            <div className={styles.sectionCard}>
              <h3>Appearance & Preferences</h3>
              <p>Configure how titles are displayed and other general preferences.</p>
              <div className={styles.settingItem}>
                <TitlePreferenceToggle />
              </div>
              <div className={styles.settingItem} style={{ marginTop: '1.5rem' }}>
                <div className={styles.settingRow}>
                  <div style={{ minWidth: 0 }}>
                    <h4 style={{ margin: 0, fontSize: '1rem' }}>Low End Mode</h4>
                    <p
                      style={{
                        margin: '0.25rem 0 0',
                        fontSize: '0.85rem',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      Disables animations and heavy visual effects for better performance on older
                      hardware.
                    </p>
                  </div>
                  <ToggleSwitch
                    isChecked={lowEndMode}
                    onChange={(e) => setLowEndMode(e.target.checked)}
                    id="low-end-mode"
                  />
                </div>
              </div>

              <div className={styles.settingItem} style={{ marginTop: '1.5rem' }}>
                <div className={styles.settingRow}>
                  <div style={{ minWidth: 0 }}>
                    <h4 style={{ margin: 0, fontSize: '1rem' }}>Virtual Keyboard</h4>
                    <p
                      style={{
                        margin: '0.25rem 0 0',
                        fontSize: '0.85rem',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      Shows an on-screen keyboard when text search fields are focused.
                    </p>
                  </div>
                  <ToggleSwitch
                    isChecked={virtualKeyboardEnabled}
                    onChange={(e) => toggleVirtualKeyboard(e.target.checked)}
                    id="virtual-keyboard-enabled"
                  />
                </div>
              </div>


              {localStorage.getItem('agreedToViewMature') === 'true' && (
                <div className={styles.settingItem} style={{ marginTop: '1.5rem' }}>
                  <div className={styles.settingRow}>
                    <div style={{ minWidth: 0 }}>
                      <h4 style={{ margin: 0, fontSize: '1rem' }}>Mature Content</h4>
                      <p
                        style={{
                          margin: '0.25rem 0 0',
                          fontSize: '0.85rem',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        You have previously agreed to view 18+ content. Toggle this off to re-enable
                        the blur gate and filtering.
                      </p>
                    </div>
                    <ToggleSwitch
                      isChecked={true}
                      onChange={(e) => {
                        if (!e.target.checked) {
                          localStorage.removeItem('agreedToViewMature')
                          window.location.reload()
                        }
                      }}
                      id="mature-content-enabled"
                    />
                  </div>
                </div>
              )}
            </div>
            <FlareSolverrSettings />
          </div>
        )
      case 'users':
        return (
          <div className={styles.tabContent}>
            <AdminUserManagement />
          </div>
        )
      case 'themes':
        return (
          <div className={styles.tabContent}>
            <ThemeSettings mode="server" />
          </div>
        )
      case 'local-media':
        return (
          <div className={styles.tabContent}>
            <LocalMediaSettings />
          </div>
        )
      case 'extensions':
        return (
          <div className={styles.tabContent}>
            <ExtensionsSettings />
          </div>
        )
      case 'sync':
        return (
          <div className={styles.tabContent}>
            <SyncProviderSelector />
            <GitHubSyncSettings />
            <GoogleAuthSettings />
            <RcloneSettings />
          </div>
        )
      case 'database':
        return (
          <div className={styles.tabContent}>
            <div className={styles.sectionCard}>
              <h3>Database Management</h3>
              <p>Download a backup of your current database or restore from an existing file.</p>
              <div className={styles.controls}>
                <Button onClick={handleBackup}>Backup Database</Button>
                <Button variant="secondary" onClick={triggerFileSelect}>
                  Restore Database
                </Button>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleRestore}
                style={{ display: 'none' }}
                accept=".db"
              />
              {statusMessage && <p className={styles.status}>{statusMessage}</p>}
            </div>
            <OfflineDbSettings />
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="page-container">
      <div className={styles.settingsHeader}>
        <h1 className={styles.pageTitle}>Admin Settings</h1>
        <p className={styles.pageSubtitle}>Manage system-wide configuration, user accounts, and media servers</p>
      </div>

      <div className={styles.settingsLayout}>
        <aside className={styles.sidebar}>
          <button
            className={`${styles.sidebarItem} ${activeTab === 'general' ? styles.active : ''}`}
            onClick={() => selectTab('general')}
          >
            <FaCog /> <span>General</span>
          </button>
          <button
            className={`${styles.sidebarItem} ${activeTab === 'users' ? styles.active : ''}`}
            onClick={() => selectTab('users')}
            id="tab-users-btn"
          >
            <FaUsers /> <span>Users</span>
          </button>
          <button
            className={`${styles.sidebarItem} ${activeTab === 'themes' ? styles.active : ''}`}
            onClick={() => selectTab('themes')}
            id="tab-themes-btn"
          >
            <FaPalette /> <span>Appearance</span>
          </button>
          <button
            className={`${styles.sidebarItem} ${activeTab === 'local-media' ? styles.active : ''}`}
            onClick={() => selectTab('local-media')}
            id="tab-local-media-btn"
          >
            <FaServer /> <span>Local Media (Shoko)</span>
          </button>
          <button
            className={`${styles.sidebarItem} ${activeTab === 'extensions' ? styles.active : ''}`}
            onClick={() => selectTab('extensions')}
            id="tab-extensions-btn"
          >
            <FaPuzzlePiece /> <span>Extensions</span>
            {hasExtensionUpdates && (
              <span
                style={{
                  marginLeft: 'auto',
                  background: '#eab308',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  boxShadow: '0 0 6px rgba(234, 179, 8, 0.6)',
                }}
                title="Extension updates available"
              />
            )}
          </button>
          <button
            className={`${styles.sidebarItem} ${activeTab === 'sync' ? styles.active : ''}`}
            onClick={() => selectTab('sync')}
          >
            <FaCloud /> <span>Synchronization</span>
          </button>
          <button
            className={`${styles.sidebarItem} ${activeTab === 'database' ? styles.active : ''}`}
            onClick={() => selectTab('database')}
          >
            <FaDatabase /> <span>Database</span>
          </button>
        </aside>

        <main className={styles.mainContent}>{renderTabContent()}</main>
      </div>
    </div>
  )
}

export default Settings
