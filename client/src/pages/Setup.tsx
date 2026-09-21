import React, { useState } from 'react'
import { useNavigate } from 'react-router'
import { FaUser, FaLock, FaIdCard, FaDatabase, FaShieldAlt } from 'react-icons/fa'
import { useAuth } from '../contexts/AuthContext'
import Logo from '../components/common/Logo'
import styles from './Setup.module.css'

const Setup: React.FC = () => {
  const { setup, hasLegacyData } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('Username and password are required.')
      return
    }

    if (password.length < 4) {
      setError('Password must be at least 4 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setError('')
    setLoading(true)

    try {
      const result = await setup(
        username.trim(),
        displayName.trim() || username.trim(),
        password
      )
      if (result.success) {
        navigate('/')
      } else {
        setError(result.error || 'Failed to complete setup.')
      }
    } catch {
      setError('An error occurred during setup. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logoWrapper}>
          <Logo />
        </div>
        <h1 className={styles.title}>Initial Setup</h1>
        <p className={styles.subtitle}>
          Create your primary Administrator account to secure your installation.
        </p>

        {hasLegacyData && (
          <div className={styles.migrationNotice}>
            <FaDatabase className={styles.migrationIcon} />
            <p className={styles.migrationText}>
              <strong>Existing Data Detected:</strong> Your existing database, watch history, and sync credentials will be automatically migrated to this administrator account.
            </p>
          </div>
        )}

        {error && <div className={styles.errorAlert}>{error}</div>}

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="setup-username">Username</label>
            <div className={styles.inputWrapper}>
              <FaUser className={styles.inputIcon} />
              <input
                id="setup-username"
                type="text"
                className={styles.input}
                placeholder="Choose a username (e.g. admin)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="setup-displayname">Display Name (optional)</label>
            <div className={styles.inputWrapper}>
              <FaIdCard className={styles.inputIcon} />
              <input
                id="setup-displayname"
                type="text"
                className={styles.input}
                placeholder="Your display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="setup-password">Password</label>
            <div className={styles.inputWrapper}>
              <FaLock className={styles.inputIcon} />
              <input
                id="setup-password"
                type="password"
                className={styles.input}
                placeholder="Create a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="setup-confirm-password">Confirm Password</label>
            <div className={styles.inputWrapper}>
              <FaLock className={styles.inputIcon} />
              <input
                id="setup-confirm-password"
                type="password"
                className={styles.input}
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={loading}
            id="setup-submit-btn"
          >
            {loading ? (
              <span className={styles.spinner} />
            ) : (
              <>
                <FaShieldAlt />
                <span>Create Administrator Account</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Setup
