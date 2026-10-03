import React, { useState } from 'react'
import { useNavigate } from 'react-router'
import { FaUser, FaLock, FaSignInAlt, FaExclamationTriangle } from 'react-icons/fa'
import { useAuth } from '../contexts/AuthContext'
import Logo from '../components/common/Logo'
import styles from './Login.module.css'

const Login: React.FC = () => {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Unblock request state
  const [isFlagged, setIsFlagged] = useState(false)
  const [unblockNote, setUnblockNote] = useState('')
  const [unblockLoading, setUnblockLoading] = useState(false)
  const [unblockSuccess, setUnblockSuccess] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('Please enter both username and password.')
      return
    }

    setError('')
    setLoading(true)

    try {
      const result = await login(username.trim(), password, rememberMe)
      if (result.success) {
        navigate('/')
      } else {
        setError(result.error || 'Invalid credentials')
        if (result.canRequestUnblock || result.errorCode === 'ACCOUNT_FLAGGED_MULTI_IP') {
          setIsFlagged(true)
        }
      }
    } catch {
      setError('Failed to sign in. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleRequestUnblock = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('Please enter both username and password to verify ownership.')
      return
    }

    setUnblockLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/request-unblock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          note: unblockNote.trim(),
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setUnblockSuccess(data.message || 'Unblock request submitted to administrator.')
      } else {
        setError(data.error || 'Failed to submit unblock request')
      }
    } catch {
      setError('Network error submitting unblock request')
    } finally {
      setUnblockLoading(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logoWrapper}>
          <Logo />
        </div>
        <h1 className={styles.title}>Welcome Back</h1>
        <p className={styles.subtitle}>Sign in to access your media and watchlists</p>

        {unblockSuccess && <div className={styles.successAlert}>{unblockSuccess}</div>}

        {isFlagged && !unblockSuccess && (
          <div className={styles.flaggedAlert}>
            <div className={styles.flaggedTitle}>
              <FaExclamationTriangle /> Account Flagged (Multi-IP)
            </div>
            <p className={styles.flaggedDesc}>
              This account was temporarily flagged for logging in from multiple locations or networks within 7 days.
              You can request the administrator to unblock your account below:
            </p>
            <form onSubmit={handleRequestUnblock} className={styles.unblockForm}>
              <textarea
                className={styles.unblockTextarea}
                placeholder="Optional explanation for the admin (e.g. Switched to 5G / travelling)..."
                value={unblockNote}
                onChange={(e) => setUnblockNote(e.target.value)}
                maxLength={500}
              />
              <button
                type="submit"
                className={styles.unblockBtn}
                disabled={unblockLoading}
              >
                {unblockLoading ? 'Submitting...' : 'Request Admin to Unblock'}
              </button>
            </form>
          </div>
        )}

        {error && <div className={styles.errorAlert}>{error}</div>}

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-username">Username</label>
            <div className={styles.inputWrapper}>
              <FaUser className={styles.inputIcon} />
              <input
                id="login-username"
                type="text"
                className={styles.input}
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-password">Password</label>
            <div className={styles.inputWrapper}>
              <FaLock className={styles.inputIcon} />
              <input
                id="login-password"
                type="password"
                className={styles.input}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
          </div>

          <div className={styles.rememberRow}>
            <label className={styles.rememberLabel} htmlFor="login-remember-me">
              <input
                id="login-remember-me"
                type="checkbox"
                className={styles.checkbox}
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>Remember me (1 month)</span>
            </label>
          </div>

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={loading}
            id="login-submit-btn"
          >
            {loading ? (
              <span className={styles.spinner} />
            ) : (
              <>
                <FaSignInAlt />
                <span>Sign In</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login
