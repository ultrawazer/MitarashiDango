import React, { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  FaUser,
  FaPalette,
  FaList,
  FaChartPie,
  FaCamera,
  FaLock,
  FaSignOutAlt,
  FaDesktop,
  FaCompass,
} from 'react-icons/fa'
import { Button } from '../components/common/Button'
import ToggleSwitch from '../components/common/ToggleSwitch'
import WatchlistSettings from '../components/settings/WatchlistSettings'
import ThemeSettings from '../components/settings/ThemeSettings'
import { useAuth } from '../contexts/AuthContext'
import { useSetting, useUpdateSetting } from '../hooks/useSettings'
import { useDismissedRecommendations, useUndismissRecommendation } from '../hooks/useRecommendations'
import toast from 'react-hot-toast'
import styles from './UserSettings.module.css'

interface SessionInfo {
  token: string
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
  expiresAt: string
  isCurrent?: boolean
}

type UserSettingsTab = 'profile' | 'watchlist' | 'insights' | 'themes' | 'appearance' | 'recommendations' | 'dismissed'

const UserSettings: React.FC = () => {
  const queryClient = useQueryClient()
  const { user, refreshUser } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') as UserSettingsTab | null
  const [activeTab, setActiveTab] = useState<UserSettingsTab>(
    initialTab && ['profile', 'watchlist', 'insights', 'themes', 'appearance', 'recommendations', 'dismissed'].includes(initialTab)
      ? initialTab === 'appearance' ? 'themes' : initialTab === 'dismissed' ? 'recommendations' : initialTab
      : 'profile'
  )


  const { data: recMatureSetting } = useSetting('recommendations_include_mature')
  const [recIncludeMature, setRecIncludeMature] = useState<boolean>(false)

  const { data: dismissedList, isLoading: loadingDismissed } = useDismissedRecommendations()
  const undismissMutation = useUndismissRecommendation()
  const [restoringId, setRestoringId] = useState<string | null>(null)

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
    if (recMatureSetting !== undefined) {
      setRecIncludeMature(recMatureSetting === 'true' || recMatureSetting === true)
    }
  }, [recMatureSetting])

  const toggleRecIncludeMature = (enabled: boolean) => {
    setRecIncludeMature(enabled)
    updateSetting.mutate(
      { key: 'recommendations_include_mature', value: String(enabled) },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['recommendations'] })
        },
      }
    )
  }

  useEffect(() => {
    document.title = 'User Settings - dango'
  }, [])

  useEffect(() => {
    const tab = searchParams.get('tab') as UserSettingsTab | null
    if (tab && ['profile', 'watchlist', 'insights', 'themes', 'appearance', 'recommendations', 'dismissed'].includes(tab)) {
      if (tab === 'appearance') {
        setActiveTab('themes')
      } else if (tab === 'dismissed') {
        setActiveTab('recommendations')
      } else {
        setActiveTab(tab)
      }
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

      case 'recommendations':
      case 'dismissed':
        return (
          <div className={styles.tabContent}>
            {/* Parameters Section Card */}
            <div className={styles.sectionCard}>
              <h3>Parameters</h3>
              <p>
                Configure recommendation engine parameters and content filtering rules.
              </p>

              <div className={styles.settingRow}>
                <div className={styles.settingInfo}>
                  <h4 className={styles.settingTitle}>
                    Add mature content (+18) / hentai
                  </h4>
                  <p className={styles.settingDescription}>
                    Allow recommendations from your library and online catalog to include mature (18+) and hentai titles. When disabled, all adult-rated and hentai content is strictly excluded from recommendation feeds.
                  </p>
                </div>
                <ToggleSwitch
                  isChecked={recIncludeMature}
                  onChange={(e) => toggleRecIncludeMature(e.target.checked)}
                  id="rec-include-mature-toggle"
                />
              </div>
            </div>

            {/* Dismissed Recommendations Section Card */}
            <div className={styles.sectionCard} id="dismissed-recommendations-section">
              <h3>Dismissed Recommendations</h3>
              <p>
                Anime titles you have hidden from your recommendation feed. Restoring a title will allow it to appear in recommendations again.
              </p>

              {loadingDismissed ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading dismissed items...</p>
              ) : !dismissedList || dismissedList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-tertiary)' }}>
                  <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    No dismissed recommendations
                  </p>
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    When you click the dismiss button (✕) on a recommended show, it will appear here so you can easily restore it later.
                  </p>
                </div>
              ) : (
                <div className={styles.dismissedList}>
                  {dismissedList.map((item) => (
                    <div key={item.showId} className={styles.dismissedRow}>
                      <div className={styles.dismissedPosterWrap}>
                        {item.thumbnail ? (
                          <img
                            src={item.thumbnail}
                            alt={item.englishName || item.name || 'Poster'}
                            className={styles.dismissedPoster}
                          />
                        ) : (
                          <div className={styles.dismissedNoPoster}>No Image</div>
                        )}
                      </div>
                      <div className={styles.dismissedInfo}>
                        <h4 className={styles.dismissedTitle}>
                          {item.englishName || item.name || `Anime #${item.showId}`}
                        </h4>
                        <div className={styles.dismissedMeta}>
                          {item.type && <span>{item.type} &bull; </span>}
                          <span>Dismissed: {new Date(item.dismissedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={restoringId === item.showId || undismissMutation.isPending}
                        onClick={async () => {
                          setRestoringId(item.showId)
                          try {
                            await undismissMutation.mutateAsync(item.showId)
                          } finally {
                            setRestoringId(null)
                          }
                        }}
                      >
                        {restoringId === item.showId ? 'Restoring...' : 'Restore'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
            <FaPalette /> <span>Appearance</span>
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
          <button
            className={`${styles.sidebarItem} ${activeTab === 'recommendations' ? styles.active : ''}`}
            onClick={() => selectTab('recommendations')}
            id="tab-recommendations-btn"
          >
            <FaCompass /> <span>Recommendations</span>
          </button>
        </aside>

        <main className={styles.mainContent}>{renderTabContent()}</main>
      </div>
    </div>
  )
}

export default UserSettings
