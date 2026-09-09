import React, { useState, useEffect } from 'react'
import GenericModal from '../common/GenericModal'
import { getExtensionAuth, setExtensionAuth, getKnownVerificationUrl } from '../../lib/extension-auth'
import styles from './ExtensionAuthModal.module.css'
import toast from 'react-hot-toast'

export interface ExtensionAuthModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  extensionId: string
  extensionName?: string
  verificationUrl?: string
}

export const ExtensionAuthModal: React.FC<ExtensionAuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  extensionId,
  extensionName,
  verificationUrl: propVerificationUrl,
}) => {
  const [step, setStep] = useState<1 | 2>(1)
  const [userAgent, setUserAgent] = useState('')
  const [cookie, setCookie] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const displayName = extensionName || (extensionId ? extensionId.toUpperCase() : 'Extension')
  const verificationUrl =
    propVerificationUrl || (extensionId ? getKnownVerificationUrl(extensionId) : '')

  let domain = ''
  try {
    if (verificationUrl) {
      domain = new URL(verificationUrl).hostname
    }
  } catch {
    domain = verificationUrl
  }

  useEffect(() => {
    if (isOpen) {
      setStep(1)
      const existing = extensionId ? getExtensionAuth(extensionId) : null
      setUserAgent(
        existing?.ua || (typeof navigator !== 'undefined' ? navigator.userAgent : '')
      )
      setCookie(existing?.cookie || '')
    }
  }, [isOpen, extensionId])

  const handleStartVerification = () => {
    if (extensionId) {
      setExtensionAuth(extensionId, { ua: userAgent })
    }
    if (verificationUrl) {
      window.open(verificationUrl, '_blank')
    }
    setStep(2)
  }

  const handleSubmitCookie = () => {
    const raw = cookie.trim()
    if (!raw) {
      toast.error('Please enter the cf_clearance cookie value')
      return
    }

    // Sanitize: strip cf_clearance= prefix and quotes if user pasted whole header
    let sanitized = raw.replace(/^cf_clearance/i, '')
    sanitized = sanitized.replace(/^[:=]\s*/, '')
    sanitized = sanitized.replace(/["';]/g, '').trim()

    setIsSubmitting(true)
    try {
      if (extensionId) {
        setExtensionAuth(extensionId, {
          cookie: sanitized,
          ua: userAgent,
        })
      }
      toast.success(`${displayName} credentials saved successfully!`)
      onSuccess?.()
      onClose()
    } catch {
      toast.error('Failed to save credentials')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <GenericModal
      isOpen={isOpen}
      onClose={onClose}
      title={`${displayName} Verification Required`}
    >
      <div className={styles.container}>
        {step === 1 ? (
          <>
            <p className={styles.instruction}>
              <strong>{displayName}</strong> is protected by Cloudflare/DDoS verification.
              Solve it once in your browser and provide the <code>cf_clearance</code> cookie so
              the app can stream content directly.
            </p>
            <div className={styles.field}>
              <label>Your User-Agent (used for requests):</label>
              <textarea
                value={userAgent}
                onChange={(e) => setUserAgent(e.target.value)}
                rows={3}
                className={styles.textarea}
              />
            </div>
            <div className={styles.actions}>
              <button className={styles.secondaryButton} onClick={onClose}>
                Cancel
              </button>
              <button className={styles.button} onClick={handleStartVerification}>
                Start Verification {domain ? `(Opens ${domain})` : ''}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={styles.instruction}>
              <p>
                1. Solve the challenge on the <strong>{domain || displayName}</strong> tab
                (keep that tab open).
              </p>
              <p style={{ marginTop: '0.5rem' }}>
                2. Copy the <strong>cf_clearance</strong> cookie value:
              </p>
              <p style={{ marginTop: '0.25rem', fontSize: '0.85em' }}>
                &bull; <strong>Chrome / Edge:</strong> Press <code>F12</code> &rarr;{' '}
                <strong>Application</strong> &rarr; <strong>Cookies</strong> &rarr;{' '}
                <code>{domain}</code>. Copy value of <strong>cf_clearance</strong>.<br />
                &bull; <strong>Firefox:</strong> Press <code>F12</code> &rarr;{' '}
                <strong>Storage</strong> &rarr; <strong>Cookies</strong> &rarr;{' '}
                <code>{domain}</code>. Copy value of <strong>cf_clearance</strong>.
              </p>
              <p style={{ marginTop: '0.5rem' }}>
                3. Paste the cookie value below:
              </p>
            </div>
            <div className={styles.field}>
              <label>cf_clearance cookie value:</label>
              <input
                type="text"
                value={cookie}
                onChange={(e) => setCookie(e.target.value)}
                placeholder="e.g. xxxxxxxx.xxxxxxxx.xxxxxxx-xxxxxxx"
                className={styles.input}
              />
            </div>
            <div className={styles.actions}>
              <button className={styles.secondaryButton} onClick={onClose}>
                Cancel
              </button>
              <button className={styles.secondaryButton} onClick={() => setStep(1)}>
                Back
              </button>
              <button
                className={styles.button}
                onClick={handleSubmitCookie}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : 'Submit'}
              </button>
            </div>
          </>
        )}
      </div>
    </GenericModal>
  )
}

export default ExtensionAuthModal
