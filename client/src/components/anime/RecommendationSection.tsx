import React, { useState } from 'react'
import { useNavigate } from 'react-router'
import {
  FaChevronLeft,
  FaChevronRight,
  FaChevronUp,
  FaChevronDown,
  FaSyncAlt,
} from 'react-icons/fa'
import { RecommendationCard } from './RecommendationCard'
import { ScoreBreakdownModal } from '../modals/ScoreBreakdownModal'
import type { RecommendationItem } from '../../types/recommendations'
import { useCarousel } from '../../hooks/useCarousel'
import { useLowEndMode } from '../../contexts/LowEndModeContext'
import styles from './RecommendationSection.module.css'

interface RecommendationSectionProps {
  title: string
  subtitle?: string
  badge?: string
  items: RecommendationItem[]
  loading?: boolean
  isRefreshing?: boolean
  onRefresh?: () => void
  onDismiss: (showId: string) => void
  collapsible?: boolean
  defaultExpanded?: boolean
}

export const RecommendationSection: React.FC<RecommendationSectionProps> = ({
  title,
  subtitle,
  badge,
  items,
  loading,
  isRefreshing,
  onRefresh,
  onDismiss,
  collapsible = true,
  defaultExpanded = true,
}) => {
  const navigate = useNavigate()
  const { lowEndMode } = useLowEndMode()
  const { emblaRef, stepBy } = useCarousel()
  const [selectedItem, setSelectedItem] = useState<RecommendationItem | null>(null)

  const storageKey = `rec_expanded_${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
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

  const handleWatch = (item: RecommendationItem) => {
    navigate(`/anime/${item.showId}`)
  }

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <div className={styles.titleRow}>
            <h2 className={styles.title}>{title}</h2>
            {badge && <span className={styles.badge}>{badge}</span>}
            {items.length > 0 && isExpanded && (
              <div className={styles.navArrows}>
                <button
                  type="button"
                  className={styles.navButton}
                  onClick={(e) => {
                    e.preventDefault()
                    stepBy('left', lowEndMode)
                  }}
                  aria-label="Previous recommendations"
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
                  aria-label="Next recommendations"
                >
                  <FaChevronRight />
                </button>
              </div>
            )}
          </div>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>

        <div className={styles.headerControls}>
          {onRefresh && (
            <button
              type="button"
              className={styles.actionButton}
              onClick={onRefresh}
              title="Refresh recommendations"
              aria-label="Refresh recommendations"
              disabled={isRefreshing}
            >
              <FaSyncAlt className={isRefreshing ? styles.spin : ''} />
            </button>
          )}

          {collapsible && (
            <button
              type="button"
              className={styles.collapseButton}
              onClick={toggleExpanded}
              aria-expanded={isExpanded}
              aria-label={isExpanded ? `Collapse ${title}` : `Expand ${title}`}
            >
              {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
            </button>
          )}
        </div>
      </div>

      {isExpanded &&
        (loading ? (
          <div className={styles.carousel} ref={emblaRef}>
            <div className={styles.track}>
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className={styles.slide}>
                  <div className={`${styles.skeletonCard} skeleton`} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className={styles.carousel} ref={emblaRef}>
            <div className={styles.track}>
              {items.map((item, index) => (
                <div key={`${item.showId}-${index}`} className={styles.slide}>
                  <RecommendationCard
                    item={item}
                    onOpenDetails={(selected) => setSelectedItem(selected)}
                    onDismiss={onDismiss}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

      {/* Score Breakdown Modal */}
      <ScoreBreakdownModal
        isOpen={selectedItem !== null}
        onClose={() => setSelectedItem(null)}
        item={selectedItem}
        onWatch={handleWatch}
        onDismiss={(item) => onDismiss(item.showId)}
      />
    </section>
  )
}
