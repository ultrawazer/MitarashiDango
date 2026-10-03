import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import {
  FaSpinner,
  FaSyncAlt,
  FaCheckCircle,
  FaInfoCircle,
  FaExclamationCircle,
  FaExclamationTriangle,
  FaPlus,
  FaTimes,
} from 'react-icons/fa'
import NotificationItem from './NotificationItem'
import NotificationSkeleton from './NotificationSkeleton'
import {
  useNotifications,
  useDiscoveryStatus,
  useClearAllNotifications,
  useSystemNotifications,
} from '../../hooks/useAnimeData'
import { useQueryClient } from '@tanstack/react-query'
import styles from './Notification.module.css'

interface NotificationDropdownProps {
  onClose?: () => void
}

const NotificationDropdown: React.FC<NotificationDropdownProps> = ({ onClose }) => {
  const { data: notifications = [], isLoading } = useNotifications()
  const { data: systemNotifications = [] } = useSystemNotifications()
  const { data: status } = useDiscoveryStatus()
  const clearAllMutation = useClearAllNotifications()
  const queryClient = useQueryClient()
  const [fullMessageId, setFullMessageId] = useState<string | null>(null)

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }, [queryClient])

  const handleClearAll = () => {
    clearAllMutation.mutate(undefined)
  }

  const fullNotification = systemNotifications.find((sn) => sn.id === fullMessageId) ?? null

  return (
    <div className={styles.dropdown}>
      <div className={styles.dropdownHeader}>
        <h4>Notifications</h4>
        {notifications.length > 0 && (
          <button className={styles.clearAllBtn} onClick={handleClearAll}>
            Clear All
          </button>
        )}
      </div>
      <div className={styles.discoveryStatusRow}>
        {status?.running ? (
          <>
            <FaSpinner className={styles.spinIcon} />
            <span>
              {status.total > 0
                ? `Checking ${Math.min(status.done, status.total)}/${status.total} shows...`
                : 'Checking for new episodes...'}
            </span>
          </>
        ) : status?.state === 'complete' ? (
          <>
            <FaCheckCircle size={12} />
            <span>
              Discovery complete — checked {status.total} {status.total === 1 ? 'show' : 'shows'}
            </span>
          </>
        ) : status?.state === 'empty' ? (
          <>
            <FaInfoCircle size={12} />
            <span>No shows set to Watching — nothing to check</span>
          </>
        ) : status?.state === 'error' ? (
          <>
            <FaExclamationCircle size={12} />
            <span>Last check failed — will retry automatically</span>
          </>
        ) : (
          <>
            <FaSyncAlt size={11} />
            <span>
              {status?.lastRunAt
                ? `Last checked ${Math.max(
                    1,
                    Math.round((Date.now() - status.lastRunAt) / 1000)
                  )}s ago`
                : 'Auto-checks every few minutes'}
            </span>
          </>
        )}
      </div>
      <div className={styles.list}>
        {isLoading && systemNotifications.length === 0 ? (
          <NotificationSkeleton count={4} />
        ) : (
          <>
            {systemNotifications.map((sn) => {
              const isAdminAlert = sn.type === 'admin-alert' || sn.type === 'security'
              return (
                <div
                  key={sn.id}
                  className={`${styles.item} ${isAdminAlert ? styles.adminAlertItem : ''}`}
                >
                  <div
                    className={styles.thumbnail}
                    style={{
                      background: 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 0,
                      boxShadow: 'none',
                    }}
                  >
                    {isAdminAlert ? (
                      <FaExclamationTriangle size={28} color="#ef4444" />
                    ) : sn.icon === 'warning' ? (
                      <FaExclamationCircle size={28} color="#f59e0b" />
                    ) : (
                      <FaInfoCircle size={28} color="#6c9fff" />
                    )}
                  </div>
                  <div className={styles.itemInfo}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className={styles.itemTitle}>{sn.title}</span>
                      {isAdminAlert && <span className={styles.alertTag}>ALERT</span>}
                    </div>
                    <button
                      type="button"
                      className={styles.systemItemMeta}
                      onClick={() => setFullMessageId(sn.id)}
                      title="View full status"
                    >
                      {sn.message.length > 45 ? sn.message.slice(0, 45) + '…' : sn.message}
                    </button>
                  </div>
                  {sn.actionUrl ? (
                    <Link
                      to={sn.actionUrl}
                      className={styles.actionBtn}
                      onClick={() => {
                        setFullMessageId(null)
                        onClose?.()
                      }}
                      title={sn.actionLabel || 'Review'}
                    >
                      {sn.actionLabel || 'Review'}
                    </Link>
                  ) : (
                    <>
                      <button
                        className={styles.removeItem}
                        disabled
                        style={{ opacity: 0.3, cursor: 'not-allowed' }}
                        aria-hidden="true"
                      >
                        <FaPlus />
                      </button>
                      <button
                        className={styles.removeItem}
                        disabled
                        style={{ opacity: 0.3, cursor: 'not-allowed' }}
                        aria-hidden="true"
                      >
                        <FaTimes />
                      </button>
                    </>
                  )}
                </div>
              )
            })}
            {systemNotifications.length > 0 && notifications.length > 0 && (
              <div className={styles.notificationDivider} />
            )}
            {notifications.length > 0
              ? notifications.map((notification) => (
                  <NotificationItem key={notification.id} notification={notification} />
                ))
              : !isLoading &&
                systemNotifications.length === 0 && (
                  <div className={styles.emptyState}>No new notifications</div>
                )}
          </>
        )}
      </div>

      {fullNotification &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: '1rem',
              backdropFilter: 'blur(3px)',
            }}
            onClick={() => setFullMessageId(null)}
          >
            <div
              style={{
                backgroundColor: 'var(--bg-secondary)',
                padding: '1.5rem',
                borderRadius: 'var(--radius-lg)',
                maxWidth: '440px',
                width: '100%',
                boxShadow: 'var(--shadow-xl)',
                border:
                  fullNotification.type === 'admin-alert'
                    ? '1px solid rgba(239, 68, 68, 0.4)'
                    : '1px solid var(--border-primary)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  marginBottom: '1rem',
                }}
              >
                {fullNotification.type === 'admin-alert' ? (
                  <FaExclamationTriangle color="#ef4444" size={20} />
                ) : fullNotification.icon === 'warning' ? (
                  <FaExclamationCircle color="#f59e0b" size={20} />
                ) : (
                  <FaInfoCircle color="#6c9fff" size={20} />
                )}
                <span style={{ color: '#fff', fontWeight: 600, fontSize: '1rem' }}>
                  {fullNotification.title}
                </span>
              </div>
              <p
                style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.5 }}
              >
                {fullNotification.message}
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                {fullNotification.actionUrl && (
                  <Link
                    to={fullNotification.actionUrl}
                    onClick={() => {
                      setFullMessageId(null)
                      onClose?.()
                    }}
                    style={{
                      background:
                        fullNotification.type === 'admin-alert' ? '#ef4444' : 'var(--accent)',
                      color: '#fff',
                      textDecoration: 'none',
                      padding: '0.5rem 1rem',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    {fullNotification.actionLabel || 'Manage'}
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => setFullMessageId(null)}
                  style={{
                    background: 'var(--primary-color)',
                    color: '#fff',
                    border: 'none',
                    padding: '0.5rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  OK
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}

export default NotificationDropdown
