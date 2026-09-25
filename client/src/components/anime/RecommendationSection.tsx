import React, { useState } from 'react'
import { useNavigate } from 'react-router'
import { FaChevronLeft, FaChevronRight, FaSyncAlt } from 'react-icons/fa'
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
  onRefresh?: () => void
  onDismiss: (showId: string) => void
}

export const RecommendationSection: React.FC<RecommendationSectionProps> = ({
  title,
  subtitle,
  badge,
  items,
  loading,
  onRefresh,
  onDismiss,
}) => {
  const navigate = useNavigate()
  const { lowEndMode } = useLowEndMode()
  const { emblaRef, stepBy } = useCarousel()
  const [selectedItem, setSelectedItem] = useState<RecommendationItem | null>(null)

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
          </div>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>

        <div className={styles.controls}>
          {onRefresh && (
            <button
              type="button"
              className={styles.refreshButton}
              onClick={onRefresh}
              title="Recalculate recommendations"
              aria-label="Recalculate recommendations"
            >
              <FaSyncAlt size={11} />
              <span>Refresh</span>
            </button>
          )}

          {items.length > 0 && (
            <>
              <button
                type="button"
                className={styles.navButton}
                onClick={() => stepBy('left', lowEndMode)}
                aria-label="Previous recommendations"
              >
                <FaChevronLeft size={12} />
              </button>
              <button
                type="button"
                className={styles.navButton}
                onClick={() => stepBy('right', lowEndMode)}
                aria-label="Next recommendations"
              >
                <FaChevronRight size={12} />
              </button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className={styles.carousel} ref={emblaRef}>
          <div className={styles.track}>
            {Array.from({ length: 5 }).map((_, i) => (
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
      )}

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
