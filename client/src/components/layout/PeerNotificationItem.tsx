import React from 'react'
import { Link, useNavigate } from 'react-router'
import { FaTimes, FaUser } from 'react-icons/fa'
import { fixThumbnailUrl } from '../../lib/utils'
import type { PeerNotification } from '../../types/peer-recommendations'
import { useMarkPeerNotificationRead } from '../../hooks/usePeerRecommendations'
import styles from './Notification.module.css'

interface PeerNotificationItemProps {
  notification: PeerNotification
  onClose?: () => void
}

export const PeerNotificationItem: React.FC<PeerNotificationItemProps> = ({
  notification,
  onClose,
}) => {
  const navigate = useNavigate()
  const markReadMutation = useMarkPeerNotificationRead()

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    markReadMutation.mutate(notification.id)
    onClose?.()
    navigate(`/anime/${notification.showId}`)
  }

  const handleDismiss = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    markReadMutation.mutate(notification.id)
  }

  const showTitle =
    notification.show.englishTitle || notification.show.title || 'Anime'

  return (
    <Link
      to={`/anime/${notification.showId}`}
      className={styles.item}
      onClick={handleClick}
      style={{ alignItems: 'flex-start' }}
    >
      {/* Sender Avatar */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          overflow: 'hidden',
          background: 'var(--primary-color, #a855f7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 2,
          color: '#fff',
          fontWeight: 700,
          fontSize: '0.85rem',
        }}
      >
        {notification.sender.avatarPath ? (
          <img
            src={notification.sender.avatarPath}
            alt={notification.sender.displayName}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span>{notification.sender.displayName.charAt(0).toUpperCase()}</span>
        )}
      </div>

      <div className={styles.itemInfo}>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.35 }}>
          <strong style={{ color: 'var(--accent, #c084fc)' }}>
            {notification.sender.displayName}
          </strong>{' '}
          recommended <strong>{showTitle}</strong>
        </div>

        {notification.note && (
          <div
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              fontStyle: 'italic',
              marginTop: '4px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={notification.note}
          >
            "{notification.note}"
          </div>
        )}

        <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              fontSize: '0.68rem',
              background: 'rgba(168, 85, 247, 0.15)',
              color: 'var(--accent, #c084fc)',
              padding: '1px 6px',
              borderRadius: '4px',
              fontWeight: 600,
            }}
          >
            Friend Recommendation
          </span>
        </div>
      </div>

      {/* Anime Thumbnail */}
      {notification.show.thumbnail && (
        <img
          src={fixThumbnailUrl(notification.show.thumbnail, 36, 48)}
          alt={showTitle}
          style={{
            width: 36,
            height: 48,
            borderRadius: '4px',
            objectFit: 'cover',
            flexShrink: 0,
          }}
        />
      )}

      <button
        className={styles.removeItem}
        onClick={handleDismiss}
        aria-label="Dismiss recommendation notification"
        title="Dismiss"
      >
        <FaTimes />
      </button>
    </Link>
  )
}
