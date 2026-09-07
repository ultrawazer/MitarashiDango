import React, { useEffect, useMemo, useCallback, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FaChevronLeft, FaChevronRight, FaHistory } from 'react-icons/fa'
import { Button } from '../components/common/Button'
import AnimeSection from '../components/anime/AnimeSection'
import AnimeCard from '../components/anime/AnimeCard'
import SkeletonGrid from '../components/common/SkeletonGrid'
import RemoveConfirmationModal from '../components/common/RemoveConfirmationModal'
import SpotlightBanner from '../components/anime/SpotlightBanner'
import QueueRail from '../components/player/QueueRail'
import Schedule from '../components/anime/Schedule'
import {
  useAllContinueWatching,
  useQueue,
  useRemoveFromQueue,
  useClearQueue,
  useReorderQueue,
  useRemoveFromWatchlist,
} from '../hooks/useAnimeData'
import { useTitlePreference } from '../contexts/TitlePreferenceContext'
import styles from './Home.module.css'

type ActiveTab = 'latest' | 'season' | 'popular' | 'week'

interface LocalSeries {
  _id: string
  id: string
  shokoSeriesId?: number
  anidbId?: number
  anilistId?: number
  name: string
  englishName?: string
  thumbnail?: string
  bannerImage?: string
  description?: string
  episodeCount?: number
  type?: string
  score?: string
  rank?: number
  isLocal?: boolean
}

interface LocalEpisodeCard {
  _id: string
  id: string
  name: string
  episodeNumber?: number
  airTime?: string
  thumbnail?: string
  type?: string
  isLocal?: boolean
}

interface LocalHomeProps {
  mediaMode: 'local' | 'mixed'
}

const LocalHome: React.FC<LocalHomeProps> = ({ mediaMode: _mediaMode }) => {
  const queryClient = useQueryClient()
  const { titlePreference } = useTitlePreference()
  const seasonalRef = useRef<HTMLDivElement>(null)

  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    return (localStorage.getItem('local_home_activeTab') as ActiveTab) || 'latest'
  })
  const [seasonFormat, setSeasonFormat] = useState(() => {
    return localStorage.getItem('local_season_format') || 'TV'
  })
  const [page, setPage] = useState(1)
  const seasonLimit = 14

  useEffect(() => {
    document.title = 'Home - dango'
  }, [])

  useEffect(() => {
    localStorage.setItem('local_home_activeTab', activeTab)
  }, [activeTab])

  useEffect(() => {
    localStorage.setItem('local_season_format', seasonFormat)
    setPage(1)
  }, [seasonFormat])

  // Queue
  const { data: queueData = [] } = useQueue()
  const removeQueue = useRemoveFromQueue()
  const clearQueue = useClearQueue()
  const reorderQueue = useReorderQueue()

  // Continue Watching
  const {
    data: continueWatchingInfinite,
    isLoading: loadingContinueWatching,
    fetchNextPage: fetchMoreContinueWatching,
    hasNextPage: hasMoreContinueWatching,
    isFetchingNextPage: fetchingMoreContinueWatching,
  } = useAllContinueWatching()

  const cwList = useMemo(() => continueWatchingInfinite?.pages || [], [continueWatchingInfinite])

  const handleReachContinueWatchingThreshold = useCallback(() => {
    if (hasMoreContinueWatching && !fetchingMoreContinueWatching && !loadingContinueWatching) {
      fetchMoreContinueWatching()
    }
  }, [hasMoreContinueWatching, fetchingMoreContinueWatching, loadingContinueWatching, fetchMoreContinueWatching])

  const [itemToRemove, setItemToRemove] = useState<{ id: string; name: string } | null>(null)
  const removeWatchlistMutation = useRemoveFromWatchlist()

  const removeCw = useMutation({
    mutationFn: async (showId: string) => {
      await fetch('/api/continue-watching/remove', {
        method: 'POST',
        body: JSON.stringify({ showId }),
        headers: { 'Content-Type': 'application/json' },
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['allContinueWatching'] })
      if (hasMoreContinueWatching && cwList.length - 1 < 14) {
        fetchMoreContinueWatching()
      }
    },
  })

  const handleRemove = useCallback(
    (id: string) => {
      const show = cwList?.find((s) => String(s.id) === String(id))
      if (show) {
        const displayTitle = (show[titlePreference as keyof typeof show] as string) || show.name
        setItemToRemove({ id, name: displayTitle })
      }
    },
    [cwList, titlePreference]
  )

  const handleConfirmRemove = useCallback(
    (options: { removeFromWatchlist?: boolean }) => {
      if (!itemToRemove) return
      removeCw.mutate(itemToRemove.id)
      if (options.removeFromWatchlist) removeWatchlistMutation.mutate(itemToRemove.id)
      setItemToRemove(null)
    },
    [itemToRemove, removeCw, removeWatchlistMutation]
  )

  // 1. Shoko Spotlight Series (Randomized current season with continue watching backfill)
  const { data: spotlightAnime = [] } = useQuery<any[]>({
    queryKey: ['shoko-spotlight'],
    queryFn: async () => {
      const res = await fetch('/api/shoko/spotlight')
      if (!res.ok) throw new Error('Failed to load spotlight')
      return res.json()
    },
    staleTime: 60 * 1000,
  })

  // 2. Latest Releases (Shoko recently added episodes)
  const { data: latestEpisodes = [], isLoading: loadingLatest } = useQuery<LocalEpisodeCard[]>({
    queryKey: ['shoko-recently-added-episodes'],
    queryFn: async () => {
      const res = await fetch('/api/shoko/recently-added-episodes?pageSize=30')
      if (!res.ok) throw new Error('Failed to load recent episodes')
      return res.json()
    },
    staleTime: 60 * 1000,
  })

  // 3. Current Season (Shoko local seasonal series)
  const { data: seasonalSeries = [], isLoading: loadingSeasonal } = useQuery<LocalSeries[]>({
    queryKey: ['shoko-seasonal', seasonFormat],
    queryFn: async () => {
      const res = await fetch(`/api/shoko/seasonal?format=${seasonFormat}`)
      if (!res.ok) throw new Error('Failed to load seasonal series')
      return res.json()
    },
    staleTime: 60 * 1000,
  })

  const pagedSeason = useMemo(() => {
    const start = (page - 1) * seasonLimit
    return seasonalSeries.slice(start, start + seasonLimit)
  }, [seasonalSeries, page, seasonLimit])

  const canGoNextSeason = page * seasonLimit < seasonalSeries.length

  // 4. Top Rated (Shoko local series ranked by rating)
  const { data: topRatedSeries = [], isLoading: loadingTopRated } = useQuery<LocalSeries[]>({
    queryKey: ['shoko-top-rated'],
    queryFn: async () => {
      const res = await fetch('/api/shoko/top-rated?limit=30')
      if (!res.ok) throw new Error('Failed to load top rated series')
      return res.json()
    },
    staleTime: 60 * 1000,
  })

  // 5. This Week (Shoko Calendar)
  const { data: thisWeekEpisodes = [], isLoading: loadingThisWeek } = useQuery<LocalEpisodeCard[]>({
    queryKey: ['shoko-calendar-week'],
    queryFn: async () => {
      const res = await fetch('/api/shoko/calendar?numberOfDays=7&showAll=false')
      if (!res.ok) throw new Error('Failed to load weekly calendar')
      return res.json()
    },
    staleTime: 60 * 1000,
  })

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: 'latest', label: 'Latest Releases' },
    { key: 'season', label: 'Current Season' },
    { key: 'popular', label: 'Top Rated' },
  ]

  const hasThisWeek = thisWeekEpisodes.length > 0
  const tabsWithWeek = hasThisWeek
    ? [{ key: 'week' as ActiveTab, label: 'This Week' }, ...tabs]
    : tabs

  const displayTab = activeTab === 'week' && !hasThisWeek ? 'latest' : activeTab

  const renderTabContent = () => {
    switch (displayTab) {
      case 'latest':
        return (
          <section style={{ marginBottom: '2.5rem' }}>
            <div className={styles['section-header']}>
              <div className={styles['title-wrapper']}>
                <div className="section-title" style={{ marginBottom: 0 }}>
                  Latest Releases
                </div>
              </div>
            </div>

            {loadingLatest ? (
              <SkeletonGrid count={12} />
            ) : latestEpisodes.length === 0 ? (
              <div className={styles.emptyState}>
                <p className={styles.emptyStateText}>No recently added episodes found in Shoko.</p>
              </div>
            ) : (
              <div className={`grid-container ${styles.seasonGrid}`}>
                {latestEpisodes.map((ep) => (
                  <AnimeCard
                    key={`latest-${ep.id}-${ep.episodeNumber}`}
                    anime={{
                      _id: ep.id,
                      id: ep.id,
                      name: ep.name,
                      thumbnail: ep.thumbnail || '',
                      type: ep.type || 'TV',
                      episodeNumber: ep.episodeNumber,
                      airTime: ep.airTime,
                    }}
                  />
                ))}
              </div>
            )}
          </section>
        )

      case 'season':
        return (
          <section style={{ marginBottom: '2.5rem' }}>
            <div className={styles['section-header']} ref={seasonalRef}>
              <div className={styles['title-wrapper']}>
                <div className="section-title" style={{ marginBottom: 0 }}>
                  Current Season
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select
                  style={{
                    width: '90px',
                    height: '34px',
                    padding: '0 8px',
                    paddingRight: '1.5rem',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 700,
                    cursor: 'pointer',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    backgroundImage:
                      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%23a1a1aa' stroke-width='2' viewBox='0 0 12 12'%3E%3Cpolyline points='3 5 6 8 9 5'/%3E%3C/svg%3E\")",
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.5rem center',
                  }}
                  value={seasonFormat}
                  onChange={(e) => setSeasonFormat(e.currentTarget.value)}
                >
                  <option value="TV">TV</option>
                  <option value="ONA">ONA</option>
                  <option value="OVA">OVA</option>
                  <option value="MOVIE">Movie</option>
                  <option value="ALL">All</option>
                </select>

                <div className={styles['pagination-controls']}>
                  <button
                    className={styles['nav-button']}
                    onClick={() => {
                      if (page > 1) {
                        setPage((p) => p - 1)
                        if (seasonalRef.current) {
                          const y =
                            seasonalRef.current.getBoundingClientRect().top + window.scrollY - 120
                          window.scrollTo({ top: y, behavior: 'smooth' })
                        }
                      }
                    }}
                    disabled={page === 1}
                    style={{ opacity: page === 1 ? 0.3 : 1 }}
                    aria-label="Previous page"
                  >
                    <FaChevronLeft size={14} />
                  </button>
                  <span className={styles['page-info']}>{page}</span>
                  <button
                    className={styles['nav-button']}
                    onClick={() => {
                      setPage((p) => p + 1)
                      if (seasonalRef.current) {
                        const y =
                          seasonalRef.current.getBoundingClientRect().top + window.scrollY - 120
                        window.scrollTo({ top: y, behavior: 'smooth' })
                      }
                    }}
                    disabled={!canGoNextSeason}
                    style={{ opacity: canGoNextSeason ? 1 : 0.3 }}
                    aria-label="Next page"
                  >
                    <FaChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>

            <div
              className={`grid-container ${styles.seasonGrid}`}
              style={{
                minHeight: '300px',
                alignContent: 'start',
              }}
            >
              {loadingSeasonal ? (
                <SkeletonGrid count={seasonLimit} />
              ) : pagedSeason.length === 0 ? (
                <div className={styles.emptyState}>
                  <p className={styles.emptyStateText}>No seasonal series found in library.</p>
                </div>
              ) : (
                pagedSeason.map((anime) => (
                  <AnimeCard
                    key={`season-${anime.id}`}
                    anime={{
                      _id: anime.id,
                      id: anime.id,
                      name: anime.name,
                      englishName: anime.englishName,
                      thumbnail: anime.thumbnail || '',
                      type: anime.type || 'TV',
                      episodeCount: anime.episodeCount,
                    }}
                  />
                ))
              )}
            </div>
          </section>
        )

      case 'popular':
        return (
          <section style={{ marginBottom: '2.5rem' }}>
            <div className={styles['section-header']}>
              <div className={styles['title-wrapper']}>
                <div className="section-title" style={{ marginBottom: 0 }}>
                  Top Rated in Library
                </div>
              </div>
            </div>

            {loadingTopRated ? (
              <SkeletonGrid count={12} />
            ) : topRatedSeries.length === 0 ? (
              <div className={styles.emptyState}>
                <p className={styles.emptyStateText}>No rated series found.</p>
              </div>
            ) : (
              <div className={`grid-container ${styles.seasonGrid}`}>
                {topRatedSeries.map((anime) => (
                  <AnimeCard
                    key={`top-${anime.id}`}
                    anime={{
                      _id: anime.id,
                      id: anime.id,
                      name: anime.name,
                      englishName: anime.englishName,
                      thumbnail: anime.thumbnail || '',
                      type: anime.type || 'TV',
                      episodeCount: anime.episodeCount,
                    }}
                    rank={anime.rank}
                  />
                ))}
              </div>
            )}
          </section>
        )

      case 'week':
        return (
          <AnimeSection
            title="This Week in Shoko"
            animeList={thisWeekEpisodes.map((ep) => ({
              _id: ep.id,
              id: ep.id,
              name: ep.name,
              thumbnail: ep.thumbnail || '',
              type: ep.type || 'TV',
              episodeNumber: ep.episodeNumber,
              airTime: ep.airTime,
            }))}
            continueWatching={false}
            carousel
            loading={loadingThisWeek}
          />
        )

      default:
        return null
    }
  }

  return (
    <div style={{ paddingBottom: '2rem' }}>
      {/* ── Spotlight Banner ── */}
      {spotlightAnime.length > 0 && <SpotlightBanner animeList={spotlightAnime} />}

      {/* ── Queue Rail ── */}
      <QueueRail
        title="Queue"
        items={queueData}
        onRemove={(item) =>
          removeQueue.mutate({ showId: item.showId, episodeNumber: item.episodeNumber })
        }
        showClearAll
        onClear={() => clearQueue.mutate()}
        onReorder={(items) =>
          reorderQueue.mutate(
            items.map((item) => ({
              id: item.id,
              showId: item.showId,
              episodeNumber: item.episodeNumber,
            }))
          )
        }
      />

      {/* ── Continue Watching ── */}
      <AnimeSection
        title="Continue Watching"
        titleLink="/watchlist/Continue Watching"
        animeList={cwList}
        continueWatching
        carousel
        collapsible
        defaultExpanded={cwList.length > 0}
        onRemove={handleRemove}
        loading={loadingContinueWatching}
        onReachThreshold={handleReachContinueWatchingThreshold}
        scrollThreshold={0.7}
        isFetchingNextPage={fetchingMoreContinueWatching}
        emptyState={
          <div className={styles.emptyState}>
            <FaHistory size={48} className={styles.emptyStateIcon} />
            <div>
              <h3 className={styles.emptyStateTitle}>Nothing is here...</h3>
              <p className={styles.emptyStateText}>
                You haven&apos;t watched anything yet. Start exploring your local anime collection!
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setActiveTab('popular')}
              style={{ marginTop: '1rem' }}
            >
              Explore Top Rated
            </Button>
          </div>
        }
      />

      {/* ── Tab Selector ── */}
      <div className={styles.tabBar}>
        {tabsWithWeek.map((tab) => (
          <Button
            key={tab.key}
            variant={displayTab === tab.key ? 'primary' : 'secondary'}
            size="sm"
            className={`${styles.tabButton} ${displayTab === tab.key ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div className={styles.tabContent}>{renderTabContent()}</div>

      {/* ── Shoko Calendar Schedule (Day-by-day Timeline) ── */}
      <Schedule isLocalCalendar={true} />

      <RemoveConfirmationModal
        isOpen={!!itemToRemove}
        onClose={() => setItemToRemove(null)}
        onConfirm={handleConfirmRemove}
        animeName={itemToRemove?.name || ''}
        scenario="continueWatching"
      />
    </div>
  )
}

export default LocalHome
