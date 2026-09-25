import React from 'react'
import { useNavigate } from 'react-router'
import { FaInfoCircle, FaTimes, FaHdd } from 'react-icons/fa'
import type { RecommendationItem } from '../../types/recommendations'
import { useTitlePreference } from '../../contexts/TitlePreferenceContext'
import styles from './RecommendationCard.module.css'

interface RecommendationCardProps {
  item: RecommendationItem
  onOpenDetails: (item: RecommendationItem) => void
  onDismiss: (showId: string) => void
}

export const RecommendationCard: React.FC<RecommendationCardProps> = ({
  item,
  onOpenDetails,
  onDismiss,
}) => {
  const navigate = useNavigate()
  const { titlePreference } = useTitlePreference()

  const title =
    (titlePreference === 'englishName' && item.englishName) ||
    (titlePreference === 'nativeName' && item.nativeName) ||
    item.name ||
    item.englishName ||
    'Unknown Title'

  const score = Math.round(item.score)
  const matchCategory =
    score >= 80 ? styles.highMatch : score >= 65 ? styles.mediumMatch : styles.lowMatch

  const handleCardClick = () => {
    // Navigate to show details
    navigate(`/anime/${item.showId}`)
  }

  const handleInfoClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    onOpenDetails(item)
  }

  const handleDismissClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    onDismiss(item.showId)
  }

  return (
    <div className={styles.card} onClick={handleCardClick} role="button" tabIndex={0}>
      <div className={styles.posterWrapper}>
        {item.thumbnail ? (
          <img src={item.thumbnail} alt={title} className={styles.posterImage} loading="lazy" />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              background: 'rgba(255,255,255,0.05)',
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

        {/* Match Percentage Pill */}
        <div className={`${styles.matchBadge} ${matchCategory}`}>
          <span>{score}%</span>
          <span>Match</span>
        </div>

        {/* Local Library Badge */}
        {item.isLocal && (
          <div className={styles.localBadge} title="Downloaded in your local Shoko library">
            <FaHdd size={10} />
            <span>Local</span>
          </div>
        )}

        {/* Card Overlay Quick Actions */}
        <div className={styles.cardActions}>
          <button
            type="button"
            className={styles.actionButton}
            onClick={handleInfoClick}
            title="View Score Breakdown"
            aria-label="View Score Breakdown"
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
        {item.reason ? (
          <p className={styles.reasonText} title={item.reason}>
            {item.reason}
          </p>
        ) : (
          <p className={styles.reasonText}>
            {item.type || 'Anime'} {item.episodeCount ? `• ${item.episodeCount} eps` : ''}
          </p>
        )}

        {item.genres && item.genres.length > 0 && (
          <div className={styles.genresList}>
            {item.genres.slice(0, 2).map((genre) => (
              <span key={genre} className={styles.genrePill}>
                {genre}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
