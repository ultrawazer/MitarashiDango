import React, { useEffect } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { FaTimes, FaCalendarDay, FaStar, FaFilm } from 'react-icons/fa'
import { useTitlePreference } from '../../contexts/TitlePreferenceContext'
import { fixThumbnailUrl } from '../../lib/utils'
import styles from './InsightsDrawer.module.css'

interface ActivityShow {
  id: string
  name: string
  nativeName?: string
  englishName?: string
  thumbnail: string
  status?: string
  score?: number
  watchedEpisodes?: number
  totalEpisodes?: number
  badges: string[]
  episodesStreamed?: number
}

interface ActivityDayResponse {
  date: string
  totalAnime: number
  totalEpisodes: number
  shows: ActivityShow[]
}

interface ActivityDayDrawerProps {
  date: string | null
  onClose: () => void
}

export const ActivityDayDrawer: React.FC<ActivityDayDrawerProps> = ({ date, onClose }) => {
  const { titlePreference } = useTitlePreference()

  // Body scroll-lock & Escape key handler
  useEffect(() => {
    if (!date) return

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [date, onClose])

  const { data, isLoading, isError } = useQuery<ActivityDayResponse>({
    queryKey: ['activityDay', date],
    queryFn: async () => {
      if (!date) throw new Error('No date provided')
      const res = await fetch(`/api/insights/activity-day?date=${date}`)
      if (!res.ok) throw new Error('Failed to fetch activity day details')
      return res.json()
    },
    enabled: Boolean(date),
  })

  if (!date) return null

  const getShowTitle = (show: ActivityShow) => {
    switch (titlePreference) {
      case 'nativeName':
        return show.nativeName || show.name
      case 'englishName':
        return show.englishName || show.name
      default:
        return show.name
    }
  }

  // Format friendly date, e.g. "Sunday, September 15, 2024"
  const formattedDate = (() => {
    try {
      const [y, m, d] = date.split('-').map(Number)
      const dateObj = new Date(y, m - 1, d)
      return dateObj.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    } catch {
      return date
    }
  })()

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.drawer} role="dialog" aria-modal="true" aria-label="Activity Day Details">
        <div className={styles.dragHandleContainer}>
          <div className={styles.dragHandle} />
        </div>

        <div className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.titleRow}>
              <h2 className={styles.title}>{formattedDate}</h2>
              {data && data.shows.length > 0 && (
                <span className={styles.badge}>
                  {data.shows.length} {data.shows.length === 1 ? 'Anime' : 'Anime'}
                </span>
              )}
            </div>
            <p className={styles.subtitle}>
              {data
                ? `${data.shows.length} anime active on this day`
                : 'Loading activity...'}
            </p>
          </div>
          <button
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close drawer"
            title="Close (Esc)"
          >
            <FaTimes />
          </button>
        </div>

        <div className={styles.content}>
          {isLoading && (
            <div className={styles.loadingSpinner}>
              <span>Loading activity...</span>
            </div>
          )}

          {isError && (
            <div className={styles.emptyState}>
              <p className={styles.emptyTitle}>Could not load activity</p>
              <p className={styles.emptyText}>Please check your connection or try again.</p>
            </div>
          )}

          {data && data.shows.length === 0 && (
            <div className={styles.emptyState}>
              <FaCalendarDay className={styles.emptyIcon} />
              <p className={styles.emptyTitle}>No Activity Recorded</p>
              <p className={styles.emptyText}>
                No episodes were streamed or milestone dates logged for {date}.
              </p>
            </div>
          )}

          {data &&
            data.shows.map((show) => {
              const displayTitle = getShowTitle(show)
              return (
                <Link
                  key={show.id}
                  to={`/anime/${show.id}`}
                  className={styles.showCard}
                  onClick={onClose}
                >
                  <img
                    src={fixThumbnailUrl(show.thumbnail)}
                    alt={displayTitle}
                    className={styles.poster}
                    loading="lazy"
                  />
                  <div className={styles.showDetails}>
                    <h4 className={styles.showName} title={displayTitle}>
                      {displayTitle}
                    </h4>

                    <div className={styles.showMetaRow}>
                      {show.badges.map((badge, idx) => {
                        let badgeClass = styles.statusPill
                        if (badge === 'Completed') badgeClass = `${styles.statusPill} ${styles.completedPill}`
                        else if (badge === 'Started') badgeClass = `${styles.statusPill} ${styles.watchingPill}`
                        else if (badge.includes('streamed')) badgeClass = `${styles.statusPill} ${styles.streamedPill}`

                        return (
                          <span key={idx} className={badgeClass}>
                            {badge}
                          </span>
                        )
                      })}

                      {show.score && show.score > 0 && (
                        <span className={styles.scoreBadge}>
                          <FaStar /> {(show.score > 10 ? show.score / 10 : show.score).toFixed(1)}
                        </span>
                      )}

                      {show.totalEpisodes && show.totalEpisodes > 0 && (
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                          <FaFilm style={{ marginRight: '4px', verticalAlign: '-1px' }} />
                          {show.watchedEpisodes !== undefined
                            ? `${show.watchedEpisodes} / ${show.totalEpisodes} eps`
                            : `${show.totalEpisodes} eps`}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              )
            })}
        </div>
      </div>
    </>
  )
}
