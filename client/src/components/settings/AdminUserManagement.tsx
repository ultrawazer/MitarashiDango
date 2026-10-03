import React, { useState, useEffect } from 'react'
import {
  FaUserPlus,
  FaKey,
  FaUserSlash,
  FaUserCheck,
  FaTrashAlt,
  FaCheckCircle,
  FaTimesCircle,
  FaUserShield,
  FaExclamationTriangle,
  FaUnlock,
  FaHistory,
  FaTv,
  FaNetworkWired,
  FaTimes,
} from 'react-icons/fa'
import { Button } from '../common/Button'
import ToggleSwitch from '../common/ToggleSwitch'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import styles from './AdminUserManagement.module.css'

interface ManagedUser {
  id: string
  username: string
  displayName: string
  role: 'admin' | 'user'
  avatarUrl: string | null
  isActive: number | boolean
  isFlagged?: boolean
  flagReason?: string | null
  createdAt: string
  lastLoginAt: string | null
  lastActiveAt?: string | null
}

interface UnblockRequest {
  id: string
  userId: string
  username: string
  displayName?: string
  ipAddress: string
  note: string | null
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
}

interface WatchedEpisodeActivity {
  showId: string
  episodeNumber: string
  watchedAt: string
  currentTime: number
  duration: number
  name: string | null
  englishName: string | null
  thumbnail: string | null
  episodeCount: number | null
}

interface LoginHistoryItem {
  id: string
  userId: string
  ipAddress: string
  userAgent: string | null
  status: string
  createdAt: string
}

interface UserActivityData {
  userId: string
  username: string
  displayName: string
  recentWatches: WatchedEpisodeActivity[]
  loginHistory: LoginHistoryItem[]
}

function formatActivityTime(isoString?: string | null): { text: string; isOnline: boolean; fullDate: string } {
  if (!isoString) return { text: 'Never', isOnline: false, fullDate: 'Never' }
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return { text: 'Never', isOnline: false, fullDate: 'Never' }

  const fullDate = date.toLocaleString()
  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.floor(diffMs / (60 * 1000))

  if (diffMinutes < 5) {
    return { text: 'Online now', isOnline: true, fullDate }
  }
  if (diffMinutes < 60) {
    return { text: `${diffMinutes}m ago`, isOnline: false, fullDate }
  }
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return { text: `${diffHours}h ago`, isOnline: false, fullDate }
  }
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) {
    return {
      text: `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      isOnline: false,
      fullDate,
    }
  }
  if (diffDays < 7) {
    return { text: `${diffDays}d ago`, isOnline: false, fullDate }
  }
  return { text: date.toLocaleDateString(), isOnline: false, fullDate }
}

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60)
    const remMins = mins % 60
    return `${hrs}:${remMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const getAuthHeaders = (): Record<string, string> => {
  const token =
    localStorage.getItem('dango_auth_token') ||
    sessionStorage.getItem('dango_auth_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export const AdminUserManagement: React.FC = () => {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [registrationEnabled, setRegistrationEnabled] = useState(false)

  // Modals state
  const [isAddUserOpen, setIsAddUserOpen] = useState(false)
  const [addUsername, setAddUsername] = useState('')
  const [addDisplayName, setAddDisplayName] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [addRole, setAddRole] = useState<'user' | 'admin'>('user')
  const [addLoading, setAddLoading] = useState(false)

  const [resetPasswordUser, setResetPasswordUser] = useState<ManagedUser | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  const [purgeUser, setPurgeUser] = useState<ManagedUser | null>(null)
  const [purgeLoading, setPurgeLoading] = useState(false)

  // Unblock requests state
  const [unblockRequests, setUnblockRequests] = useState<UnblockRequest[]>([])
  const [unblockLoading, setUnblockLoading] = useState<Record<string, boolean>>({})

  // Activity modal state
  const [activityModalUser, setActivityModalUser] = useState<ManagedUser | null>(null)
  const [activityData, setActivityData] = useState<UserActivityData | null>(null)
  const [activityLoading, setActivityLoading] = useState(false)

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/users', {
        headers: {
          ...getAuthHeaders(),
        },
      })
      if (res.ok) {
        const data = await res.json()
        const userList = Array.isArray(data)
          ? data
          : Array.isArray(data?.users)
            ? data.users
            : []
        setUsers(userList)
      } else {
        setUsers([])
        toast.error('Failed to load users list')
      }
    } catch {
      setUsers([])
      toast.error('Failed to load users list')
    } finally {
      setLoading(false)
    }
  }

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/admin/settings', {
        headers: {
          ...getAuthHeaders(),
        },
      })
      if (res.ok) {
        const data = await res.json()
        const regVal =
          data?.registration_enabled ?? data?.settings?.registration_enabled
        setRegistrationEnabled(regVal === 'true' || regVal === true)
      }
    } catch {}
  }

  const fetchUnblockRequests = async () => {
    try {
      const res = await fetch('/api/admin/unblock-requests', {
        headers: { ...getAuthHeaders() },
      })
      if (res.ok) {
        const data = await res.json()
        setUnblockRequests(Array.isArray(data?.requests) ? data.requests : [])
      }
    } catch {
      setUnblockRequests([])
    }
  }

  useEffect(() => {
    fetchUsers()
    fetchSettings()
    fetchUnblockRequests()
  }, [])

  const handleResolveUnblock = async (requestId: string, action: 'approve' | 'reject') => {
    setUnblockLoading((prev) => ({ ...prev, [requestId]: true }))
    try {
      const res = await fetch(`/api/admin/unblock-requests/${requestId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast.success(action === 'approve' ? 'User unblocked and baseline reset!' : 'Unblock request dismissed.')
        fetchUsers()
        fetchUnblockRequests()
      } else {
        toast.error(data.error || 'Failed to resolve unblock request')
      }
    } catch {
      toast.error('Network error resolving unblock request')
    } finally {
      setUnblockLoading((prev) => ({ ...prev, [requestId]: false }))
    }
  }

  const handleDirectUnblock = async (targetUser: ManagedUser) => {
    if (!window.confirm(`Are you sure you want to unblock @${targetUser.username} and reset their IP baseline?`)) {
      return
    }

    try {
      const res = await fetch(`/api/admin/users/${targetUser.id}/unblock`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
        },
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast.success(`Account @${targetUser.username} unblocked successfully!`)
        fetchUsers()
        fetchUnblockRequests()
      } else {
        toast.error(data.error || 'Failed to unblock user')
      }
    } catch {
      toast.error('Network error unblocking user')
    }
  }

  const handleViewActivity = async (targetUser: ManagedUser) => {
    setActivityModalUser(targetUser)
    setActivityData(null)
    setActivityLoading(true)

    try {
      const res = await fetch(`/api/admin/users/${targetUser.id}/activity`, {
        headers: { ...getAuthHeaders() },
      })
      if (res.ok) {
        const data = await res.json()
        setActivityData(data)
      } else {
        toast.error('Failed to load user activity')
      }
    } catch {
      toast.error('Network error loading activity')
    } finally {
      setActivityLoading(false)
    }
  }

  const handleToggleRegistration = async (enabled: boolean) => {
    setRegistrationEnabled(enabled)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ key: 'registration_enabled', value: String(enabled) }),
      })
      if (res.ok) {
        toast.success(
          enabled ? 'Public user registration enabled' : 'Public user registration disabled'
        )
      } else {
        toast.error('Failed to update registration setting')
      }
    } catch {
      toast.error('Network error updating registration setting')
    }
  }

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addUsername.trim() || !addPassword) {
      toast.error('Username and password are required')
      return
    }

    setAddLoading(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          username: addUsername.trim(),
          displayName: addDisplayName.trim() || addUsername.trim(),
          password: addPassword,
          role: addRole,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast.success(`User @${addUsername} created successfully!`)
        setIsAddUserOpen(false)
        setAddUsername('')
        setAddDisplayName('')
        setAddPassword('')
        setAddRole('user')
        fetchUsers()
      } else {
        toast.error(data.error || 'Failed to create user')
      }
    } catch {
      toast.error('Network error creating user')
    } finally {
      setAddLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetPasswordUser || !newPassword) return

    setResetLoading(true)
    try {
      const res = await fetch(`/api/admin/users/${resetPasswordUser.id}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ newPassword }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast.success(`Password reset for @${resetPasswordUser.username}`)
        setResetPasswordUser(null)
        setNewPassword('')
      } else {
        toast.error(data.error || 'Failed to reset password')
      }
    } catch {
      toast.error('Network error resetting password')
    } finally {
      setResetLoading(false)
    }
  }

  const handleToggleActive = async (targetUser: ManagedUser) => {
    if (targetUser.id === currentUser?.id) {
      toast.error('You cannot deactivate your own account')
      return
    }

    const isUserCurrentlyActive = Boolean(targetUser.isActive)
    const nextActive = isUserCurrentlyActive ? 0 : 1
    const actionName = nextActive ? 'reactivate' : 'deactivate'

    if (!window.confirm(`Are you sure you want to ${actionName} @${targetUser.username}?`)) {
      return
    }

    try {
      const res = await fetch(`/api/admin/users/${targetUser.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ isActive: nextActive }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast.success(`User @${targetUser.username} ${nextActive ? 'activated' : 'deactivated'}`)
        fetchUsers()
      } else {
        toast.error(data.error || 'Failed to update user status')
      }
    } catch {
      toast.error('Network error updating user status')
    }
  }

  const handlePurge = async () => {
    if (!purgeUser) return

    setPurgeLoading(true)
    try {
      const res = await fetch(`/api/admin/users/${purgeUser.id}/purge`, {
        method: 'DELETE',
        headers: {
          ...getAuthHeaders(),
        },
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast.success(`User @${purgeUser.username} and all database files permanently purged.`)
        setPurgeUser(null)
        fetchUsers()
      } else {
        toast.error(data.error || 'Failed to purge user data')
      }
    } catch {
      toast.error('Network error purging user data')
    } finally {
      setPurgeLoading(false)
    }
  }

  return (
    <div className={styles.container}>
      {/* Registration Settings Card */}
      <div className={styles.sectionCard}>
        <div className={styles.headerRow}>
          <div>
            <h3 className={styles.title}>Account Registration</h3>
            <p className={styles.subtitle}>
              Allow anyone on your local network to register an account on this server.
            </p>
          </div>
          <ToggleSwitch
            id="registration-toggle"
            isChecked={registrationEnabled}
            onChange={(e) => handleToggleRegistration(e.target.checked)}
          />
        </div>
      </div>

      {/* Pending Unblock Requests Banner */}
      {unblockRequests.length > 0 && (
        <div className={styles.unblockBannerCard}>
          <h3 className={styles.unblockBannerTitle}>
            <FaExclamationTriangle /> Pending Account Unblock Requests ({unblockRequests.length})
          </h3>
          <div className={styles.unblockList}>
            {unblockRequests.map((req) => (
              <div key={req.id} className={styles.unblockItem}>
                <div className={styles.unblockItemInfo}>
                  <div className={styles.unblockItemUser}>
                    <span>{req.displayName || req.username}</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>@{req.username}</span>
                    <span className={styles.unblockItemIp}>IP: {req.ipAddress}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {new Date(req.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {req.note && (
                    <div className={styles.unblockItemNote}>
                      &ldquo;{req.note}&rdquo;
                    </div>
                  )}
                </div>
                <div className={styles.unblockItemActions}>
                  <Button
                    size="sm"
                    disabled={unblockLoading[req.id]}
                    onClick={() => handleResolveUnblock(req.id, 'approve')}
                  >
                    <FaUnlock style={{ marginRight: '0.35rem' }} /> Approve & Unblock
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={unblockLoading[req.id]}
                    onClick={() => handleResolveUnblock(req.id, 'reject')}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* User Accounts List */}
      <div className={styles.sectionCard}>
        <div className={styles.headerRow}>
          <div>
            <h3 className={styles.title}>User Accounts</h3>
            <p className={styles.subtitle}>
              Manage user accounts, passwords, permissions, and database storage.
            </p>
          </div>
          <Button onClick={() => setIsAddUserOpen(true)} id="add-user-btn">
            <FaUserPlus style={{ marginRight: '0.4rem' }} /> Add User
          </Button>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>Loading user accounts...</p>
        ) : (
          <div className={styles.userTableWrapper}>
            <table className={styles.userTable}>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Last Activity</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {Array.isArray(users) && users.length > 0 ? (
                  users.map((u) => {
                    const initial = (u.displayName || u.username).charAt(0).toUpperCase()
                    const isSelf = u.id === currentUser?.id
                    const act = formatActivityTime(u.lastActiveAt || u.lastLoginAt)
                    return (
                      <tr key={u.id}>
                        <td>
                          <div className={styles.userInfoCell}>
                            <div className={styles.userAvatar}>
                              {u.avatarUrl ? (
                                <img src={u.avatarUrl} alt={u.displayName} />
                              ) : (
                                initial
                              )}
                            </div>
                            <div className={styles.userMeta}>
                              <span className={styles.userDisplayName}>
                                {u.displayName} {isSelf && '(You)'}
                              </span>
                              <span className={styles.userUsername}>@{u.username}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span
                            className={`${styles.roleBadge} ${
                              u.role === 'admin' ? styles.roleAdmin : styles.roleUser
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td>
                          {u.isFlagged ? (
                            <span
                              className={`${styles.statusBadge} ${styles.statusFlagged}`}
                              title={u.flagReason || 'Account flagged for multi-IP logins in 7 days'}
                            >
                              <FaExclamationTriangle /> Flagged
                            </span>
                          ) : Boolean(u.isActive) ? (
                            <span className={`${styles.statusBadge} ${styles.statusActive}`}>
                              <FaCheckCircle /> Active
                            </span>
                          ) : (
                            <span className={`${styles.statusBadge} ${styles.statusInactive}`}>
                              <FaTimesCircle /> Inactive
                            </span>
                          )}
                        </td>
                        <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                        <td>
                          <span className={act.isOnline ? styles.onlineIndicator : styles.activityTime} title={act.fullDate}>
                            {act.isOnline && <span className={styles.onlinePulseDot} />}
                            {act.text}
                          </span>
                        </td>
                        <td>
                          <div className={styles.actionsCell} style={{ justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className={styles.actionIconBtn}
                              title="View Watch & Login Activity"
                              onClick={() => handleViewActivity(u)}
                            >
                              <FaHistory />
                            </button>

                            {u.isFlagged && (
                              <button
                                type="button"
                                className={`${styles.actionIconBtn} ${styles.actionIconBtnSuccess}`}
                                title="Unblock User & Reset IP Baseline"
                                onClick={() => handleDirectUnblock(u)}
                              >
                                <FaUnlock />
                              </button>
                            )}

                            <button
                              type="button"
                              className={styles.actionIconBtn}
                              title="Reset Password"
                              onClick={() => setResetPasswordUser(u)}
                            >
                              <FaKey />
                            </button>

                            {!isSelf && (
                              <button
                                type="button"
                                className={styles.actionIconBtn}
                                title={Boolean(u.isActive) ? 'Deactivate User' : 'Reactivate User'}
                                onClick={() => handleToggleActive(u)}
                              >
                                {Boolean(u.isActive) ? <FaUserSlash /> : <FaUserCheck />}
                              </button>
                            )}

                            {!isSelf && (
                              <button
                                type="button"
                                className={`${styles.actionIconBtn} ${styles.actionIconBtnDanger}`}
                                title="Permanently Purge User Data"
                                onClick={() => setPurgeUser(u)}
                              >
                                <FaTrashAlt />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        textAlign: 'center',
                        padding: '2.5rem',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      No user accounts found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {isAddUserOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsAddUserOpen(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Add New User</h3>
            <form onSubmit={handleAddUser} className={styles.modalForm}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Username</label>
                <input
                  type="text"
                  className={styles.formInput}
                  placeholder="e.g. alice"
                  value={addUsername}
                  onChange={(e) => setAddUsername(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Display Name</label>
                <input
                  type="text"
                  className={styles.formInput}
                  placeholder="e.g. Alice"
                  value={addDisplayName}
                  onChange={(e) => setAddDisplayName(e.target.value)}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Password</label>
                <input
                  type="password"
                  className={styles.formInput}
                  placeholder="Temporary or permanent password"
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Role</label>
                <select
                  className={styles.formInput}
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as 'user' | 'admin')}
                >
                  <option value="user">Standard User</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>

              <div className={styles.modalButtons}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsAddUserOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={addLoading}>
                  {addLoading ? 'Creating...' : 'Create Account'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetPasswordUser && (
        <div className={styles.modalOverlay} onClick={() => setResetPasswordUser(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>
              Reset Password: @{resetPasswordUser.username}
            </h3>
            <form onSubmit={handleResetPassword} className={styles.modalForm}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>New Password</label>
                <input
                  type="password"
                  className={styles.formInput}
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className={styles.modalButtons}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setResetPasswordUser(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={resetLoading}>
                  {resetLoading ? 'Resetting...' : 'Set New Password'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Purge Confirmation Modal */}
      {purgeUser && (
        <div className={styles.modalOverlay} onClick={() => setPurgeUser(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle} style={{ color: '#f87171' }}>
              Permanently Purge @{purgeUser.username}?
            </h3>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              This will permanently delete this user's isolated database (<code style={{ color: 'var(--accent)' }}>users/{purgeUser.id}/anime.db</code>), all watch history, bookmarks, avatars, and sessions.
              <br /><br />
              <strong style={{ color: '#fca5a5' }}>This action cannot be undone.</strong>
            </p>

            <div className={styles.modalButtons}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPurgeUser(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={purgeLoading}
                onClick={handlePurge}
              >
                {purgeLoading ? 'Purging...' : 'Yes, Permanently Purge'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* User Activity Modal */}
      {activityModalUser && (
        <div className={styles.modalOverlay} onClick={() => setActivityModalUser(null)}>
          <div className={styles.activityModalContent} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 className={styles.modalTitle}>
                <FaHistory style={{ marginRight: '0.5rem', color: 'var(--accent)' }} />
                Activity: {activityModalUser.displayName} (@{activityModalUser.username})
              </h3>
              <button
                type="button"
                className={styles.actionIconBtn}
                onClick={() => setActivityModalUser(null)}
                title="Close"
              >
                <FaTimes />
              </button>
            </div>

            {activityLoading ? (
              <p style={{ color: 'var(--text-secondary)' }}>Loading user activity history...</p>
            ) : (
              <>
                {/* Section 1: Recently Watched Anime */}
                <div className={styles.activitySection}>
                  <h4 className={styles.activitySectionHeader}>
                    <FaTv style={{ color: 'var(--accent)' }} /> Recently Watched Anime
                  </h4>

                  {activityData?.recentWatches && activityData.recentWatches.length > 0 ? (
                    <div className={styles.watchesList}>
                      {activityData.recentWatches.map((w, idx) => {
                        const progress =
                          w.duration > 0
                            ? Math.min(100, Math.round((w.currentTime / w.duration) * 100))
                            : 0
                        return (
                          <div key={`${w.showId}-${w.episodeNumber}-${idx}`} className={styles.watchCard}>
                            {w.thumbnail ? (
                              <img src={w.thumbnail} alt={w.name || 'Poster'} className={styles.watchThumbnail} />
                            ) : (
                              <div className={styles.watchThumbnail} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <FaTv style={{ color: 'var(--text-muted)' }} />
                              </div>
                            )}
                            <div className={styles.watchInfo}>
                              <span className={styles.watchTitle}>
                                {w.englishName || w.name || `Show #${w.showId}`}
                              </span>
                              <div className={styles.watchMeta}>
                                <span className={styles.episodeBadge}>Ep {w.episodeNumber}</span>
                                <span>{new Date(w.watchedAt).toLocaleString()}</span>
                                {w.duration > 0 && (
                                  <span>
                                    {formatDuration(w.currentTime)} / {formatDuration(w.duration)} ({progress}%)
                                  </span>
                                )}
                              </div>
                              {w.duration > 0 && (
                                <div className={styles.progressBarContainer}>
                                  <div
                                    className={styles.progressBarFill}
                                    style={{ width: `${progress}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      No watch history recorded for this user yet.
                    </p>
                  )}
                </div>

                {/* Section 2: Recent Login History */}
                <div className={styles.activitySection}>
                  <h4 className={styles.activitySectionHeader}>
                    <FaNetworkWired style={{ color: 'var(--accent)' }} /> Recent Login Locations & IPs
                  </h4>

                  {activityData?.loginHistory && activityData.loginHistory.length > 0 ? (
                    <div className={styles.loginHistoryList}>
                      {activityData.loginHistory.map((item) => (
                        <div key={item.id} className={styles.loginHistoryRow}>
                          <span className={styles.loginIp}>{item.ipAddress}</span>
                          <span className={styles.loginTime}>
                            {new Date(item.createdAt).toLocaleString()}
                          </span>
                          <span
                            className={
                              item.status === 'success'
                                ? styles.loginStatusSuccess
                                : styles.loginStatusFlagged
                            }
                          >
                            {item.status.toUpperCase()}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      No login attempts recorded yet.
                    </p>
                  )}
                </div>
              </>
            )}

            <div className={styles.modalButtons}>
              <Button type="button" variant="secondary" onClick={() => setActivityModalUser(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminUserManagement
