import React, { useState, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { createPortal } from 'react-dom'
import { useFloating, flip, shift, autoUpdate } from '@floating-ui/react'
import { FaTimes, FaInfoCircle } from 'react-icons/fa'
import type { FriendRecommendationGroup } from '../../types/peer-recommendations'
import { useTitlePreference } from '../../contexts/TitlePreferenceContext'
import styles from './FriendRecommendationCard.module.css'

interface FriendRecommendationCardProps {
  group: FriendRecommendationGroup
  onDismiss: (showId: string) => void
}

export const FriendRecommendationCard: React.FC<FriendRecommendationCardProps> = ({
  group,
  onDismiss,
}) => {
  const navigate = useNavigate()
  const { titlePreference } = useTitlePreference()

  const [isPopoverOpen, setIsPopoverOpen] = useState(false)
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isTouchDevice = useRef(typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches)

  const { refs, floatingStyles } = useFloating({
    open: isPopoverOpen,
    onOpenChange: setIsPopoverOpen,
    placement: 'bottom-start',
    middleware: [flip(), shift({ padding: 12 })],
    whileElementsMounted: autoUpdate,
  })

  const title =
    (titlePreference === 'englishName' && group.showTitleEnglish) ||
    (titlePreference === 'nativeName' && group.showTitleNative) ||
    group.showTitle ||
    group.showTitleEnglish ||
    'Unknown Title'

  // Dynamic Social Badge text - strictly text only, no icons
  const badgeText = useMemo(() => {
    const count = group.recommenders.length
    if (count === 0) return 'Recommended'
    if (count === 1) {
      return `Recommended by ${group.recommenders[0].displayName}`
    }
    if (count === 2) {
      return `Recommended by ${group.recommenders[0].displayName} & ${group.recommenders[1].displayName}`
    }
    return `Recommended by ${group.recommenders[0].displayName} & ${count - 1} others`
  }, [group.recommenders])

  const handleMouseEnterBadge = () => {
    if (isTouchDevice.current) return
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current)
    setIsPopoverOpen(true)
  }

  const handleMouseLeaveBadge = () => {
    if (isTouchDevice.current) return
    closeTimeoutRef.current = setTimeout(() => {
      setIsPopoverOpen(false)
    }, 250)
  }

  const handleCardClick = () => {
    navigate(`/anime/${group.showId}`)
  }

  const handleBadgeClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsPopoverOpen((prev) => !prev)
  }

  const handleDismissClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsPopoverOpen(false)
    onDismiss(group.showId)
  }

  const handleDetailsClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsPopoverOpen(false)
    navigate(`/anime/${group.showId}`)
  }

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${Math.max(1, mins)}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return new Date(dateStr).toLocaleDateString()
  }

  return (
    <>
      <div className={styles.card} onClick={handleCardClick} role="button" tabIndex={0}>
        <div className={styles.posterWrapper}>
          {group.showThumbnail ? (
            <img src={group.showThumbnail} alt={title} className={styles.posterImage} loading="lazy" />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-tertiary)',
                fontSize: '0.8rem',
              }}
            >
              No Image
            </div>
          )}

          {/* Dynamic Social Badge (Anchored floating element, strictly NO icons) */}
          <div
            ref={refs.setReference}
            className={styles.socialBadge}
            onMouseEnter={handleMouseEnterBadge}
            onMouseLeave={handleMouseLeaveBadge}
            onClick={handleBadgeClick}
            title="Click or hover to see all friend notes"
          >
            <span className={styles.socialBadgeText}>{badgeText}</span>

            {/* Overlapping Avatar Stack */}
            <div className={styles.avatarStack}>
              {group.recommenders.slice(0, 2).map((rec) => (
                <div key={rec.id} className={styles.stackedAvatar} title={rec.displayName}>
                  {rec.avatarPath ? (
                    <img
                      src={rec.avatarPath}
                      alt={rec.displayName}
                      style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span>{rec.displayName.charAt(0).toUpperCase()}</span>
                  )}
                </div>
              ))}
              {group.recommenders.length > 2 && (
                <div className={styles.stackedOverflow}>+{group.recommenders.length - 2}</div>
              )}
            </div>
          </div>

          {/* Card Overlay Quick Actions */}
          <div className={styles.cardActions}>
            <button
              type="button"
              className={styles.actionButton}
              onClick={handleDetailsClick}
              title="View anime details"
              aria-label="View anime details"
            >
              <FaInfoCircle size={13} />
            </button>
            <button
              type="button"
              className={`${styles.actionButton} ${styles.dismissButton}`}
              onClick={handleDismissClick}
              title="Not interested (Dismiss)"
              aria-label="Dismiss recommendation"
            >
              <FaTimes size={13} />
            </button>
          </div>
        </div>

        <div className={styles.infoArea}>
          <h4 className={styles.title} title={title}>
            {title}
          </h4>
          <p className={styles.subtitle}>
            {group.showType || 'Anime'} • {group.recommenders.length}{' '}
            {group.recommenders.length === 1 ? 'recommendation' : 'recommendations'}
          </p>
        </div>
      </div>

      {/* Hoverable Popover Window */}
      {isPopoverOpen &&
        createPortal(
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className={styles.popoverPortal}
            onMouseEnter={handleMouseEnterBadge}
            onMouseLeave={handleMouseLeaveBadge}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.popoverHeader}>
              <div className={styles.popoverTitle}>
                Recommended by {group.recommenders.length}{' '}
                {group.recommenders.length === 1 ? 'friend' : 'friends'}
              </div>
              <div className={styles.popoverSubtitle}>{title}</div>
            </div>

            <div className={styles.recommendersList}>
              {group.recommenders.map((rec) => (
                <div key={rec.id} className={styles.recommenderItem}>
                  <div className={styles.recommenderUserRow}>
                    <div className={styles.recommenderAvatar}>
                      {rec.avatarPath ? (
                        <img
                          src={rec.avatarPath}
                          alt={rec.displayName}
                          style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                        />
                      ) : (
                        <span>{rec.displayName.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <span className={styles.recommenderName}>
                      {rec.displayName}{' '}
                      <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>
                        @{rec.username}
                      </span>
                    </span>
                    <span className={styles.recommenderDate}>{formatTimeAgo(rec.createdAt)}</span>
                  </div>

                  {rec.note ? (
                    <div className={styles.noteBubble}>"{rec.note}"</div>
                  ) : (
                    <div className={styles.noNoteText}>Recommended without a note</div>
                  )}
                </div>
              ))}
            </div>

            <div className={styles.popoverFooter}>
              <button
                type="button"
                onClick={handleDismissClick}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-tertiary)',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  padding: '4px 8px',
                }}
              >
                Dismiss show
              </button>
              <button
                type="button"
                onClick={handleDetailsClick}
                style={{
                  background: 'var(--primary-color, #a855f7)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-sm, 6px)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '5px 10px',
                }}
              >
                Open Anime
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
