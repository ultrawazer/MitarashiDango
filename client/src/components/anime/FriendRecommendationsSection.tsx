import React, { useState } from 'react'
import { FaChevronLeft, FaChevronRight, FaChevronUp, FaChevronDown } from 'react-icons/fa'
import { FriendRecommendationCard } from './FriendRecommendationCard'
import type { FriendRecommendationGroup } from '../../types/peer-recommendations'
import { useDismissFriendShow } from '../../hooks/usePeerRecommendations'
import { useCarousel } from '../../hooks/useCarousel'
import { useLowEndMode } from '../../contexts/LowEndModeContext'
import styles from './RecommendationSection.module.css'

interface FriendRecommendationsSectionProps {
  items: FriendRecommendationGroup[]
  loading?: boolean
  collapsible?: boolean
  defaultExpanded?: boolean
}

export const FriendRecommendationsSection: React.FC<FriendRecommendationsSectionProps> = ({
  items,
  loading = false,
  collapsible = true,
  defaultExpanded = true,
}) => {
  const { lowEndMode } = useLowEndMode()
  const { emblaRef, stepBy } = useCarousel()
  const dismissMutation = useDismissFriendShow()

  const storageKey = 'rec_expanded_friend_recommendations'
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    if (!collapsible) return true
    const saved = localStorage.getItem(storageKey)
    return saved !== null ? saved === 'true' : defaultExpanded
  })

  const toggleExpanded = () => {
    setIsExpanded((prev) => {
      const next = !prev
      localStorage.setItem(storageKey, String(next))
      return next
    })
  }

  if (!loading && items.length === 0) {
    return null
  }

  const handleDismiss = (showId: string) => {
    dismissMutation.mutate(showId)
  }

  return (
    <section className={styles.section} style={{ marginBottom: '2rem' }}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <div className={styles.titleRow}>
            <h2 className={styles.title}>Friend Recommendations</h2>
            <span
              className={styles.badge}
              style={{
                background: 'rgba(168, 85, 247, 0.2)',
                color: 'var(--accent, #c084fc)',
                border: '1px solid rgba(168, 85, 247, 0.35)',
              }}
            >
              Friends
            </span>

            {items.length > 0 && isExpanded && (
              <div className={styles.navArrows}>
                <button
                  type="button"
                  className={styles.navButton}
                  onClick={(e) => {
                    e.preventDefault()
                    stepBy('left', lowEndMode)
                  }}
                  aria-label="Previous friend recommendations"
                >
                  <FaChevronLeft />
                </button>
                <button
                  type="button"
                  className={styles.navButton}
                  onClick={(e) => {
                    e.preventDefault()
                    stepBy('right', lowEndMode)
                  }}
                  aria-label="Next friend recommendations"
                >
                  <FaChevronRight />
                </button>
              </div>
            )}
          </div>
          <p className={styles.subtitle}>Anime recommended to you by other users</p>
        </div>

        <div className={styles.headerControls}>
          {collapsible && (
            <button
              type="button"
              className={styles.collapseButton}
              onClick={toggleExpanded}
              aria-label={isExpanded ? 'Collapse section' : 'Expand section'}
            >
              {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className={styles.carousel} ref={emblaRef}>
          <div className={styles.track}>
            {items.map((group) => (
              <div key={group.showId} className={styles.slide}>
                <FriendRecommendationCard group={group} onDismiss={handleDismiss} />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
