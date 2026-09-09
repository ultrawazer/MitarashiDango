import React, { useState, useEffect } from 'react'
import { FaShieldAlt, FaSync, FaCheckCircle, FaExclamationCircle } from 'react-icons/fa'
import { Button } from '../common/Button'
import ToggleSwitch from '../common/ToggleSwitch'
import { useSetting, useUpdateSetting } from '../../hooks/useSettings'
import styles from '../../pages/Settings.module.css'
import toast from 'react-hot-toast'

interface TestResult {
  success: boolean
  version?: string
  message?: string
  error?: string
  latencyMs?: number
}

const FlareSolverrSettings: React.FC = () => {
  const { data: enabledSetting, isLoading: isEnabledLoading } = useSetting('flaresolverr_enabled')
  const { data: urlSetting } = useSetting('flaresolverr_url')
  const { data: portSetting } = useSetting('flaresolverr_port')

  const updateSetting = useUpdateSetting()

  const [enabled, setEnabled] = useState<boolean>(false)
  const [url, setUrl] = useState<string>('http://localhost')
  const [port, setPort] = useState<string>('8191')
  const [testing, setTesting] = useState<boolean>(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  useEffect(() => {
    if (enabledSetting !== undefined && enabledSetting !== null) {
      setEnabled(enabledSetting === 'true' || enabledSetting === true)
    }
  }, [enabledSetting])

  useEffect(() => {
    if (typeof urlSetting === 'string' && urlSetting.trim() !== '') {
      setUrl(urlSetting)
    }
  }, [urlSetting])

  useEffect(() => {
    if (portSetting !== undefined && portSetting !== null && String(portSetting).trim() !== '') {
      setPort(String(portSetting))
    }
  }, [portSetting])

  const handleToggle = async (checked: boolean) => {
    setEnabled(checked)
    try {
      await updateSetting.mutateAsync({
        key: 'flaresolverr_enabled',
        value: checked ? 'true' : 'false',
      })
    } catch {
      setEnabled(!checked)
    }
  }

  const handleSaveConnection = async () => {
    try {
      await Promise.all([
        updateSetting.mutateAsync({ key: 'flaresolverr_url', value: url.trim() }),
        updateSetting.mutateAsync({ key: 'flaresolverr_port', value: port.trim() }),
      ])
      toast.success('FlareSolverr connection settings saved!')
    } catch (err) {
      toast.error('Failed to save connection settings')
    }
  }

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/flaresolverr/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), port: port.trim() }),
      })
      const data = (await res.json()) as TestResult
      setTestResult(data)
      if (data.success) {
        toast.success(`Connected to FlareSolverr (${data.version || 'ready'}) in ${data.latencyMs}ms`)
      } else {
        toast.error(`Connection failed: ${data.error || 'Unknown error'}`)
      }
    } catch (err) {
      const errorMsg = (err as Error).message || 'Request failed'
      setTestResult({ success: false, error: errorMsg })
      toast.error(`Connection failed: ${errorMsg}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className={styles.sectionCard} style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
        <FaShieldAlt style={{ color: 'var(--accent, #6366f1)', fontSize: '1.25rem' }} />
        <h3 style={{ margin: 0 }}>FlareSolverr (Cloudflare & Cookie Bypass)</h3>
      </div>
      <p style={{ marginBottom: '1.25rem' }}>
        Configure an automated FlareSolverr proxy service to solve Cloudflare anti-bot challenges and
        extract clearance cookies (<code style={{ fontSize: '0.8rem' }}>cf_clearance</code>) without
        manual intervention. When disabled, standard browser verification is used.
      </p>

      {/* Enable Toggle */}
      <div className={styles.settingItem} style={{ borderTop: 'none', paddingTop: 0 }}>
        <div className={styles.settingRow}>
          <div style={{ minWidth: 0 }}>
            <h4 style={{ margin: 0, fontSize: '1rem' }}>Enable FlareSolverr</h4>
            <p
              style={{
                margin: '0.25rem 0 0',
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
              }}
            >
              Automatically solve Cloudflare challenges and bypass 403 blocks for extensions like
              AnimePahe and Japanese ASMR.
            </p>
          </div>
          <ToggleSwitch
            isChecked={enabled}
            onChange={(e) => handleToggle(e.target.checked)}
            id="flaresolverr-enabled"
            disabled={isEnabledLoading}
          />
        </div>
      </div>

      {/* Connection Settings */}
      <div className={styles.settingItem} style={{ marginTop: '1.25rem' }}>
        <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>Connection Configuration</h4>
        <p
          style={{
            margin: '0 0 1rem 0',
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
          }}
        >
          Specify the host URL and port where FlareSolverr is running. In Docker networks, use the
          container service name (e.g., <code style={{ fontSize: '0.8rem' }}>http://flaresolverr</code>).
        </p>

        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: '2 1 220px', minWidth: 0 }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: '0.25rem',
              }}
            >
              Host URL
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://localhost or http://flaresolverr"
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color, rgba(255,255,255,0.15))',
                background: 'var(--bg-primary, rgba(0,0,0,0.3))',
                color: 'var(--text-primary, #fff)',
                fontSize: '0.875rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ flex: '1 1 100px', minWidth: 0 }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: '0.25rem',
              }}
            >
              Port
            </label>
            <input
              type="text"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="8191"
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color, rgba(255,255,255,0.15))',
                background: 'var(--bg-primary, rgba(0,0,0,0.3))',
                color: 'var(--text-primary, #fff)',
                fontSize: '0.875rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignSelf: 'flex-end', marginTop: '0.5rem' }}>
            <Button variant="primary" size="sm" onClick={handleSaveConnection}>
              Save
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleTestConnection}
              disabled={testing}
            >
              <FaSync className={testing ? 'fa-spin' : ''} style={{ marginRight: '0.3rem' }} />
              {testing ? 'Testing...' : 'Test Connection'}
            </Button>
          </div>
        </div>

        {/* Live Test Feedback Banner */}
        {testResult && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              background: testResult.success
                ? 'rgba(16, 185, 129, 0.12)'
                : 'rgba(239, 68, 68, 0.12)',
              border: testResult.success
                ? '1px solid rgba(16, 185, 129, 0.3)'
                : '1px solid rgba(239, 68, 68, 0.3)',
              color: testResult.success ? '#10b981' : '#ef4444',
            }}
          >
            {testResult.success ? (
              <FaCheckCircle style={{ flexShrink: 0 }} />
            ) : (
              <FaExclamationCircle style={{ flexShrink: 0 }} />
            )}
            <div>
              {testResult.success ? (
                <span>
                  <strong>Connected!</strong> FlareSolverr is active
                  {testResult.version ? ` (${testResult.version})` : ''} — latency:{' '}
                  {testResult.latencyMs}ms.
                </span>
              ) : (
                <span>
                  <strong>Connection failed:</strong> {testResult.error}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default FlareSolverrSettings
