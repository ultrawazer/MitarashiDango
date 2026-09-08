import React, { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { FaTimes, FaSearch, FaStar, FaFilm, FaLayerGroup } from 'react-icons/fa'
import { useTitlePreference } from '../../contexts/TitlePreferenceContext'
import { fixThumbnailUrl } from '../../lib/utils'
import styles from './InsightsDrawer.module.css'

interface GenreShow {
  id: string
  name: string
  nativeName?: string
  englishName?: string
  thumbnail: string
  status?: string
  score?: number
  watchedEpisodes?: number
  totalEpisodes?: number
  type?: string
}

interface GenreShowsResponse {
  genre: string
  total: number
  shows: GenreShow[]
}

interface GenreExplorerDrawerProps {
  genre: string | null
  onClose: () => void
}

export const GenreExplorerDrawer: React.FC<GenreExplorerDrawerProps> = ({ genre, onClose }) => {
  const { titlePreference } = useTitlePreference()
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'score' | 'name' | 'episodes'>('score')

  // Reset search when genre changes
  useEffect(() => {
    setSearchQuery('')
    setSortBy('score')
  }, [genre])

  // Body scroll-lock & Escape key handler
  useEffect(() => {
    if (!genre) return

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
  }, [genre, onClose])

  const { data, isLoading, isError } = useQuery<GenreShowsResponse>({
    queryKey: ['genreShows', genre],
    queryFn: async () => {
      if (!genre) throw new Error('No genre specified')
      const res = await fetch(`/api/insights/genre-shows?genre=${encodeURIComponent(genre)}`)
      if (!res.ok) throw new Error('Failed to fetch genre shows')
      return res.json()
    },
    enabled: Boolean(genre),
  })

  const getShowTitle = (show: GenreShow) => {
    switch (titlePreference) {
      case 'nativeName':
        return show.nativeName || show.name
      case 'englishName':
        return show.englishName || show.name
      default:
        return show.name
    }
  }

  const filteredAndSortedShows = useMemo(() => {
    if (!data?.shows) return []

    let result = [...data.shows]

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter((s) => {
        const title = getShowTitle(s).toLowerCase()
        const orig = (s.name || '').toLowerCase()
        const eng = (s.englishName || '').toLowerCase()
        const nat = (s.nativeName || '').toLowerCase()
        return title.includes(q) || orig.includes(q) || eng.includes(q) || nat.includes(q)
      })
    }

    result.sort((a, b) => {
      if (sortBy === 'score') {
        const scoreA = a.score || 0
        const scoreB = b.score || 0
        return scoreB - scoreA
      }
      if (sortBy === 'name') {
        const titleA = getShowTitle(a).toLowerCase()
        const titleB = getShowTitle(b).toLowerCase()
        return titleA.localeCompare(titleB)
      }
      if (sortBy === 'episodes') {
        const epA = a.watchedEpisodes || a.totalEpisodes || 0
        const epB = b.watchedEpisodes || b.totalEpisodes || 0
        return epB - epA
      }
      return 0
    })

    return result
  }, [data?.shows, searchQuery, sortBy, titlePreference])

  if (!genre) return null

  return createPortal(
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.drawer} role="dialog" aria-modal="true" aria-label={`${genre} Anime Explorer`}>
        <div className={styles.dragHandleContainer}>
          <div className={styles.dragHandle} />
        </div>

        <div className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.titleRow}>
              <h2 className={styles.title}>{genre}</h2>
              {data && (
                <span className={styles.badge}>
                  {data.total} {data.total === 1 ? 'Title' : 'Titles'}
                </span>
              )}
            </div>
            <p className={styles.subtitle}>
              {data ? `All ${genre} anime in your library` : 'Loading genre library...'}
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

        <div className={styles.filterBar}>
          <div className={styles.searchInputWrapper}>
            <FaSearch className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder={`Search ${genre} anime...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            className={styles.sortSelect}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'score' | 'name' | 'episodes')}
            aria-label="Sort anime by"
          >
            <option value="score">Score</option>
            <option value="name">Title</option>
            <option value="episodes">Episodes</option>
          </select>
        </div>

        <div className={styles.content}>
          {isLoading && (
            <div className={styles.loadingSpinner}>
              <span>Loading {genre} library...</span>
            </div>
          )}

          {isError && (
            <div className={styles.emptyState}>
              <p className={styles.emptyTitle}>Could not load anime</p>
              <p className={styles.emptyText}>Please check your connection or try again.</p>
            </div>
          )}

          {data && filteredAndSortedShows.length === 0 && (
            <div className={styles.emptyState}>
              <FaLayerGroup className={styles.emptyIcon} />
              <p className={styles.emptyTitle}>
                {searchQuery ? 'No Matching Anime Found' : `No ${genre} Titles`}
              </p>
              <p className={styles.emptyText}>
                {searchQuery
                  ? `No anime in ${genre} matched "${searchQuery}".`
                  : `You don't have any ${genre} anime in your library yet.`}
              </p>
            </div>
          )}

          {data &&
            filteredAndSortedShows.map((show) => {
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
                      {show.status && (
                        <span
                          className={`${styles.statusPill} ${
                            show.status === 'Completed'
                              ? styles.completedPill
                              : show.status === 'Watching'
                                ? styles.watchingPill
                                : ''
                          }`}
                        >
                          {show.status}
                        </span>
                      )}

                      {show.type && (
                        <span className={styles.statusPill}>
                          {show.type}
                        </span>
                      )}

                      {show.score && show.score > 0 && (
                        <span className={styles.scoreBadge}>
                          <FaStar /> {(show.score > 10 ? show.score / 10 : show.score).toFixed(1)}
                        </span>
                      )}

                      {(show.totalEpisodes || show.watchedEpisodes !== undefined) && (
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                          <FaFilm style={{ marginRight: '4px', verticalAlign: '-1px' }} />
                          {show.watchedEpisodes !== undefined
                            ? `${show.watchedEpisodes} / ${show.totalEpisodes || '?'} eps`
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
    </>,
    document.body
  )
}
