import React, { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router'
import {
  FaUser,
  FaPalette,
  FaList,
  FaChartPie,
  FaCamera,
  FaLock,
  FaSignOutAlt,
  FaDesktop,
} from 'react-icons/fa'
import { Button } from '../components/common/Button'
import ToggleSwitch from '../components/common/ToggleSwitch'
import WatchlistSettings from '../components/settings/WatchlistSettings'
import ThemeSettings from '../components/settings/ThemeSettings'
import { useAuth } from '../contexts/AuthContext'
import { useSetting, useUpdateSetting } from '../hooks/useSettings'
import toast from 'react-hot-toast'
import styles from './UserSettings.module.css'

type UserSettingsTab = 'profile' | 'watchlist' | 'insights' | 'themes'

interface SessionInfo {
  token: string
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
  expiresAt: string
  isCurrent?: boolean
}

const UserSettings: React.FC = () => {
  const { user, refreshUser } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') as UserSettingsTab | null
  const [activeTab, setActiveTab] = useState<UserSettingsTab>(
    initialTab && ['profile', 'watchlist', 'insights', 'themes'].includes(initialTab)
      ? initialTab
      : 'profile'
  )

  // Profile fields
  const [displayName, setDisplayName] = useState(user?.displayName || '')
  const [savingProfile, setSavingProfile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  // Sessions
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [loadingSessions, setLoadingSessions] = useState(false)

  // Insights setting
  const updateSetting = useUpdateSetting()
  const [insightsIncludeWatchlist, setInsightsIncludeWatchlist] = useState(false)
  const { data: insightsIncludeWatchlistSetting } = useSetting('insights_include_watchlist')

  useEffect(() => {
    if (user?.displayName) {
      setDisplayName(user.displayName)
    }
  }, [user])

  useEffect(() => {
    if (insightsIncludeWatchlistSetting !== undefined) {
      setInsightsIncludeWatchlist(
        insightsIncludeWatchlistSetting === 'true' || insightsIncludeWatchlistSetting === true
      )
    }
  }, [insightsIncludeWatchlistSetting])

  useEffect(() => {
    document.title = 'User Settings - dango'
  }, [])

  useEffect(() => {
    const tab = searchParams.get('tab') as UserSettingsTab | null
    if (tab && ['profile', 'watchlist', 'insights', 'themes'].includes(tab)) {
      setActiveTab(tab)
    }
  }, [searchParams])

  const selectTab = (tab: UserSettingsTab) => {
    setActiveTab(tab)
    setSearchParams(tab === 'profile' ? {} : { tab })
  }

  const getAuthHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('dango_auth_token') || sessionStorage.getItem('dango_auth_token')
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const fetchSessions = async () => {
    try {
      setLoadingSessions(true)
      const res = await fetch('/api/auth/me/sessions', { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        const list = Array.isArray(data) ? data : Array.isArray(data?.sessions) ? data.sessions : []
        setSessions(list)
      } else {
        setSessions([])
      }
    } catch {
      setSessions([])
    } finally {
      setLoadingSessions(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'profile') {
      fetchSessions()
    }
  }, [activeTab])

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!displayName.trim()) {
      toast.error('Display name cannot be empty')
      return
    }

    setSavingProfile(true)
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ displayName: displayName.trim() }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast.success('Profile updated!')
        await refreshUser()
      } else {
        toast.error(data.error || 'Failed to update profile')
      }
    } catch {
      toast.error('Network error updating profile')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingAvatar(true)
    const formData = new FormData()
    formData.append('avatar', file)

    try {
      const res = await fetch('/api/auth/me/avatar', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast.success('Avatar uploaded successfully!')
        await refreshUser()
      } else {
        toast.error(data.error || 'Failed to upload avatar')
      }
    } catch {
      toast.error('Network error uploading avatar')
    } finally {
      setUploadingAvatar(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentPassword || !newPassword) {
      toast.error('Please enter current and new passwords')
      return
    }

    if (newPassword.length < 4) {
      toast.error('New password must be at least 4 characters long')
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match')
      return
    }

    setSavingPassword(true)
    try {
      const res = await fetch('/api/auth/me/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast.success('Password changed successfully!')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        toast.error(data.error || 'Failed to change password')
      }
    } catch {
      toast.error('Network error changing password')
    } finally {
      setSavingPassword(false)
    }
  }

  const handleRevokeOtherSessions = async () => {
    if (!window.confirm('Are you sure you want to log out of all other devices?')) return

    try {
      const res = await fetch('/api/auth/me/sessions', {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        toast.success('All other sessions revoked!')
        fetchSessions()
      }
    } catch {
      toast.error('Failed to revoke sessions')
    }
  }

  const toggleInsightsIncludeWatchlist = (enabled: boolean) => {
    setInsightsIncludeWatchlist(enabled)
    updateSetting.mutate({ key: 'insights_include_watchlist', value: String(enabled) })
  }

  const initial = (user?.displayName || user?.username || 'U').charAt(0).toUpperCase()

  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <div className={styles.tabContent}>
            <div className={styles.sectionCard}>
              <h3>Account Profile</h3>
              <p>Manage your avatar, display name, and password credentials.</p>

              {/* Avatar Upload */}
              <div className={styles.profileAvatarSection}>
                <div
                  className={styles.avatarContainer}
                  onClick={() => fileInputRef.current?.click()}
                  title="Click to change avatar"
                >
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.displayName} className={styles.avatarImg} />
                  ) : (
                    <div className={styles.avatarPlaceholder}>{initial}</div>
                  )}
                  <div className={styles.avatarOverlay}>
                    <FaCamera />
                    <span>Change</span>
                  </div>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleAvatarChange}
                  style={{ display: 'none' }}
                  accept="image/png,image/jpeg,image/webp,image/gif"
                />

                <div className={styles.avatarMeta}>
                  <div className={styles.avatarTitle}>
                    {user?.displayName} <span style={{ color: 'var(--text-muted)' }}>@{user?.username}</span>
                  </div>
                  <div className={styles.avatarSub}>
                    {uploadingAvatar ? 'Uploading avatar...' : 'Click the avatar circle to upload a custom profile picture.'}
                  </div>
                </div>
              </div>

              {/* Display Name Form */}
              <form onSubmit={handleUpdateProfile} className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Display Name</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Button type="submit" disabled={savingProfile} size="sm">
                    {savingProfile ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </form>

              {/* Password Form */}
              <div style={{ marginTop: '2.5rem', paddingTop: '2rem', borderTop: '1px solid var(--border-primary)' }}>
                <h4 style={{ margin: '0 0 0.5rem', fontSize: '1rem', color: 'var(--text-primary)' }}>
                  Change Password
                </h4>
                <p style={{ margin: '0 0 1.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Enter your current password and choose a new one.
                </p>

                <form onSubmit={handleChangePassword} className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Current Password</label>
                    <input
                      type="password"
                      className={styles.formInput}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>New Password</label>
                    <input
                      type="password"
                      className={styles.formInput}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Confirm New Password</label>
                    <input
                      type="password"
                      className={styles.formInput}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Button type="submit" disabled={savingPassword} size="sm">
                      {savingPassword ? 'Updating...' : 'Update Password'}
                    </Button>
                  </div>
                </form>
              </div>

              {/* Active Sessions */}
              <div style={{ marginTop: '2.5rem', paddingTop: '2rem', borderTop: '1px solid var(--border-primary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>
                      Active Sessions
                    </h4>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      Devices currently authenticated to your account.
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={handleRevokeOtherSessions}>
                    Log Out Other Devices
                  </Button>
                </div>

                <div className={styles.sessionsList}>
                  {loadingSessions ? (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading sessions...</p>
                  ) : !Array.isArray(sessions) || sessions.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Current session only.</p>
                  ) : (
                    sessions.map((s, idx) => (
                      <div key={s.token || idx} className={styles.sessionItem}>
                        <div className={styles.sessionInfo}>
                          <span className={styles.sessionDevice}>
                            <FaDesktop style={{ marginRight: '0.4rem' }} />
                            {s.userAgent ? s.userAgent.substring(0, 50) : 'Browser Session'}
                            {(s.isCurrent || idx === 0) && <span className={styles.currentBadge}>Current</span>}
                          </span>
                          <span className={styles.sessionMeta}>
                            IP: {s.ipAddress || 'Local'} &bull; Created: {new Date(s.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )

      case 'watchlist':
        return (
          <div className={styles.tabContent}>
            <WatchlistSettings />
          </div>
        )

      case 'insights':
        return (
          <div className={styles.tabContent}>
            <div className={styles.sectionCard}>
              <h3>Watch Insights</h3>
              <p>Configure how anime watch statistics, completion history, and metrics are calculated for your account.</p>
              <div style={{ marginTop: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem' }}>
                  <div style={{ minWidth: 0 }}>
                    <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>
                      Include Watchlist in Insights
                    </h4>
                    <p
                      style={{
                        margin: '0.25rem 0 0',
                        fontSize: '0.85rem',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.45,
                      }}
                    >
                      Incorporate your overall watchlist progress, total completed episodes, and imported watch history (MyAnimeList / AniList) into Insights. When disabled, Insights strictly reflects video streamed directly inside Dango.
                    </p>
                  </div>
                  <ToggleSwitch
                    isChecked={insightsIncludeWatchlist}
                    onChange={(e) => toggleInsightsIncludeWatchlist(e.target.checked)}
                    id="user-insights-include-watchlist"
                  />
                </div>
              </div>
            </div>
          </div>
        )

      case 'themes':
        return (
          <div className={styles.tabContent}>
            <ThemeSettings mode="user" />
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="page-container">
      <div className={styles.settingsHeader}>
        <h1 className={styles.pageTitle}>User Settings</h1>
        <p className={styles.pageSubtitle}>Personalize your account, profile, watchlist, and theme preferences</p>
      </div>

      <div className={styles.settingsLayout}>
        <aside className={styles.sidebar}>
          <button
            className={`${styles.sidebarItem} ${activeTab === 'profile' ? styles.active : ''}`}
            onClick={() => selectTab('profile')}
            id="tab-profile-btn"
          >
            <FaUser /> <span>Profile</span>
          </button>
          <button
            className={`${styles.sidebarItem} ${activeTab === 'themes' ? styles.active : ''}`}
            onClick={() => selectTab('themes')}
            id="tab-themes-btn"
          >
            <FaPalette /> <span>Themes</span>
          </button>
          <button
            className={`${styles.sidebarItem} ${activeTab === 'watchlist' ? styles.active : ''}`}
            onClick={() => selectTab('watchlist')}
            id="tab-watchlist-btn"
          >
            <FaList /> <span>Watchlist</span>
          </button>
          <button
            className={`${styles.sidebarItem} ${activeTab === 'insights' ? styles.active : ''}`}
            onClick={() => selectTab('insights')}
            id="tab-insights-btn"
          >
            <FaChartPie /> <span>Insights</span>
          </button>
        </aside>

        <main className={styles.mainContent}>{renderTabContent()}</main>
      </div>
    </div>
  )
}

export default UserSettings
