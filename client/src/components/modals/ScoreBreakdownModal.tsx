import React from 'react'
import { useNavigate } from 'react-router'
import { FaPlay } from 'react-icons/fa'
import { Modal } from '../common/Modal'
import { Button } from '../common/Button'
import type { RecommendationItem } from '../../types/recommendations'
import styles from './ScoreBreakdownModal.module.css'

interface ScoreBreakdownModalProps {
  isOpen: boolean
  onClose: () => void
  item: RecommendationItem | null
  onWatch?: (item: RecommendationItem) => void
  onDismiss?: (item: RecommendationItem) => void
}

export const ScoreBreakdownModal: React.FC<ScoreBreakdownModalProps> = ({
  isOpen,
  onClose,
  item,
  onWatch,
  onDismiss,
}) => {
  const navigate = useNavigate()
  if (!item) return null

  const breakdown = item.breakdown || {
    genre: 0,
    theme: 0,
    tone: 0,
    narrative: 0,
    demographic: 0,
  }

  const dimensions = [
    {
      key: 'theme',
      label: 'Theme & World Elements',
      value: breakdown.theme,
      className: styles.themeBar,
    },
    {
      key: 'genre',
      label: 'Genre Compatibility',
      value: breakdown.genre,
      className: styles.genreBar,
    },
    {
      key: 'tone',
      label: 'Atmosphere & Tone',
      value: breakdown.tone,
      className: styles.toneBar,
    },
    {
      key: 'narrative',
      label: 'Story Pacing & Format',
      value: breakdown.narrative,
      className: styles.narrativeBar,
    },
    {
      key: 'demographic',
      label: 'Target Demographic',
      value: breakdown.demographic,
      className: styles.demographicBar,
    },
  ]

  const title = item.englishName || item.name || 'Anime Recommendation'

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Recommendation Breakdown"
      width="md"
      footer={
        <div style={{ display: 'flex', gap: '0.75rem', width: '100%', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {onDismiss && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onDismiss(item)
                onClose()
              }}
            >
              Not Interested
            </Button>
          )}
          {item.isLocal ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (onWatch) {
                  onWatch(item)
                } else {
                  navigate(`/watch/${item.showId}/1`)
                }
                onClose()
              }}
            >
              <FaPlay size={10} style={{ marginRight: '6px' }} /> Play Episode 1
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (onWatch) {
                  onWatch(item)
                } else {
                  navigate(`/anime/${item.showId}`)
                }
                onClose()
              }}
            >
              View Anime Details
            </Button>
          )}
        </div>
      }
    >
      <div className={styles.content}>
        <div className={styles.showBanner}>
          {item.thumbnail && (
            <img src={item.thumbnail} alt={title} className={styles.thumbnail} />
          )}
          <div className={styles.titleInfo}>
            <h3 className={styles.title}>{title}</h3>
            {item.reason && <p className={styles.reason}>{item.reason}</p>}
            <div className={styles.overallScore}>
              <span className={styles.scoreNumber}>{Math.round(item.score)}%</span>
              <span className={styles.scoreLabel}>Match Score</span>
            </div>
          </div>
        </div>

        <div className={styles.barsList}>
          {dimensions.map((dim) => (
            <div key={dim.key} className={styles.barItem}>
              <div className={styles.barHeader}>
                <span className={styles.barLabel}>{dim.label}</span>
                <span className={styles.barValue}>{Math.round(dim.value)}%</span>
              </div>
              <div className={styles.progressTrack}>
                <div
                  className={`${styles.progressBar} ${dim.className}`}
                  style={{ width: `${Math.max(5, Math.min(100, dim.value))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
