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
  createdAt: string
  lastLoginAt: string | null
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

  useEffect(() => {
    fetchUsers()
    fetchSettings()
  }, [])

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
                  <th>Last Login</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {Array.isArray(users) && users.length > 0 ? (
                  users.map((u) => {
                    const initial = (u.displayName || u.username).charAt(0).toUpperCase()
                    const isSelf = u.id === currentUser?.id
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
                          {Boolean(u.isActive) ? (
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
                        <td>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'Never'}</td>
                        <td>
                          <div className={styles.actionsCell} style={{ justifyContent: 'flex-end' }}>
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
    </div>
  )
}

export default AdminUserManagement
