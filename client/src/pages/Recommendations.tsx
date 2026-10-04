import React, { useState, useMemo, useEffect } from 'react'
import {
  FaCompass,
  FaSyncAlt,
  FaHdd,
  FaGlobe,
  FaSearch,
  FaTimes,
  FaFilter,
  FaThLarge,
} from 'react-icons/fa'
import {
  useRecommendations,
  useLocalLibraryRecommendations,
  useRefreshRecommendations,
  useDismissRecommendation,
  type RecommendationItem,
} from '../hooks/useRecommendations'
import { useFriendRecommendationsFeed } from '../hooks/usePeerRecommendations'
import { useSetting } from '../hooks/useSettings'
import { RecommendationCard } from '../components/anime/RecommendationCard'
import { FriendRecommendationsSection } from '../components/anime/FriendRecommendationsSection'
import { ScoreBreakdownModal } from '../components/modals/ScoreBreakdownModal'
import { Button } from '../components/common/Button'
import styles from './Recommendations.module.css'

type SourceFilter = 'all' | 'for_you' | 'local'

const FORMAT_OPTIONS = [
  { value: 'ALL', label: 'All Formats' },
  { value: 'TV', label: 'TV Series' },
  { value: 'MOVIE', label: 'Movie' },
  { value: 'OVA', label: 'OVA' },
  { value: 'SPECIAL', label: 'Special' },
]

const SCORE_OPTIONS = [
  { value: 0, label: 'Any Match' },
  { value: 60, label: '60%+ Match' },
  { value: 70, label: '70%+ Match' },
  { value: 80, label: '80%+ Match' },
  { value: 90, label: '90%+ Match' },
]

const Recommendations: React.FC = () => {
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [formatFilter, setFormatFilter] = useState<string>('ALL')
  const [minScoreFilter, setMinScoreFilter] = useState<number>(0)
  const [genreFilter, setGenreFilter] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState<string>('')

  const [modalItem, setModalItem] = useState<RecommendationItem | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const { data: forYouData = [], isLoading: loadingForYou } = useRecommendations(60)
  const { data: localData = [], isLoading: loadingLocal } = useLocalLibraryRecommendations(60)
  const { data: friendRecs = [], isLoading: loadingFriendRecs } = useFriendRecommendationsFeed()
  const { data: recMatureSetting } = useSetting('recommendations_include_mature')
  const includeMature = recMatureSetting === 'true' || recMatureSetting === true

  const refreshMutation = useRefreshRecommendations()
  const dismissMutation = useDismissRecommendation()

  useEffect(() => {
    document.title = 'Recommendations - dango'
  }, [])

  // Aggregate available genres dynamically from loaded items
  const availableGenres = useMemo(() => {
    const genreSet = new Set<string>()
    for (const item of [...forYouData, ...localData]) {
      if (item.genres && Array.isArray(item.genres)) {
        for (const g of item.genres) {
          if (g) genreSet.add(g)
        }
      }
    }
    return Array.from(genreSet).sort()
  }, [forYouData, localData])

  // Combine and deduplicate recommendations based on selected source tab
  const combinedItems = useMemo(() => {
    if (sourceFilter === 'local') return localData
    if (sourceFilter === 'for_you') return forYouData

    // 'all': merge local and for_you, deduplicate by showId, sort by score descending
    const map = new Map<string, RecommendationItem>()
    // Add local first so isLocal is preserved if both have it
    for (const item of localData) {
      map.set(item.showId, item)
    }
    for (const item of forYouData) {
      if (!map.has(item.showId)) {
        map.set(item.showId, item)
      } else {
        // If it was in local, prefer the higher score
        const existing = map.get(item.showId)!
        if (item.score > existing.score) {
          map.set(item.showId, { ...item, isLocal: true })
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.score - a.score)
  }, [sourceFilter, forYouData, localData])

  // Filter items by format, score, genre, and search text
  const filteredItems = useMemo(() => {
    return combinedItems.filter((item) => {
      // Mature / Adult content filter
      if (!includeMature) {
        const isHentai = item.genres?.some((g) => g.toLowerCase().includes('hentai'))
        const isAdult =
          item.isAdult === true ||
          (item.type || '').toUpperCase() === 'ADULT' ||
          (item.mediaType || '').toUpperCase() === 'ADULT'
        if (isHentai || isAdult) return false
      }

      // Format filter
      if (formatFilter !== 'ALL') {
        const itemType = (item.type || item.mediaType || '').toUpperCase()
        if (itemType !== formatFilter) return false
      }

      // Min score filter
      if (minScoreFilter > 0) {
        if (item.score < minScoreFilter) return false
      }

      // Genre filter
      if (genreFilter !== 'ALL') {
        if (!item.genres?.some((g) => g.toLowerCase() === genreFilter.toLowerCase())) {
          return false
        }
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const titleMatch =
          item.name?.toLowerCase().includes(q) ||
          item.englishName?.toLowerCase().includes(q) ||
          item.nativeName?.toLowerCase().includes(q)
        if (!titleMatch) return false
      }

      return true
    })
  }, [combinedItems, formatFilter, minScoreFilter, genreFilter, searchQuery])

  const handleOpenDetails = (item: RecommendationItem) => {
    setModalItem(item)
    setIsModalOpen(true)
  }

  const handleDismiss = (showId: string) => {
    dismissMutation.mutate(showId)
  }

  const handleResetFilters = () => {
    setSourceFilter('all')
    setFormatFilter('ALL')
    setMinScoreFilter(0)
    setGenreFilter('ALL')
    setSearchQuery('')
  }

  const isLoading = loadingForYou || loadingLocal
  const localCount = filteredItems.filter((i) => i.isLocal).length

  return (
    <div className="page-container">
      {/* Header */}
      <div className={styles.pageHeader}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>
            <FaCompass style={{ color: 'var(--accent)' }} /> Recommendations
          </h1>
          <p className={styles.pageSubtitle}>
            Personalized anime suggestions tuned to your tastes and local library backlog
          </p>
        </div>

        <div className={styles.headerActions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            title="Recalculate recommendations in the background"
          >
            <FaSyncAlt
              style={{
                marginRight: '6px',
                animation: refreshMutation.isPending ? 'spin 1s linear infinite' : 'none',
              }}
            />
            {refreshMutation.isPending ? 'Recalculating...' : 'Refresh Feed'}
          </Button>
        </div>
      </div>

      {/* Friend Recommendations Carousel */}
      <FriendRecommendationsSection items={friendRecs} loading={loadingFriendRecs} />

      {/* Filter and Control Bar */}
      <div className={styles.filterBar}>
        <div className={styles.filterTopRow}>
          {/* Source Tabs */}
          <div className={styles.sourceTabs}>
            <button
              type="button"
              className={`${styles.sourceTab} ${sourceFilter === 'all' ? styles.active : ''}`}
              onClick={() => setSourceFilter('all')}
            >
              <FaThLarge size={12} />
              <span>All Sources</span>
            </button>
            <button
              type="button"
              className={`${styles.sourceTab} ${sourceFilter === 'for_you' ? styles.active : ''}`}
              onClick={() => setSourceFilter('for_you')}
            >
              <FaGlobe size={12} />
              <span>Recommended For You</span>
            </button>
            <button
              type="button"
              className={`${styles.sourceTab} ${sourceFilter === 'local' ? styles.active : ''}`}
              onClick={() => setSourceFilter('local')}
            >
              <FaHdd size={12} />
              <span>From Your Library</span>
            </button>
          </div>

          {/* Quick Search */}
          <div className={styles.searchBox}>
            <FaSearch className={styles.searchIcon} size={12} />
            <input
              type="text"
              placeholder="Search recommendations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
            {searchQuery && (
              <button
                type="button"
                className={styles.clearSearchBtn}
                onClick={() => setSearchQuery('')}
                title="Clear search"
              >
                <FaTimes size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Detailed Controls */}
        <div className={styles.filterControlsRow}>
          {/* Format Selector */}
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Format:</label>
            <select
              value={formatFilter}
              onChange={(e) => setFormatFilter(e.target.value)}
              className={styles.selectInput}
            >
              {FORMAT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Match Score Selector */}
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Score:</label>
            <select
              value={minScoreFilter}
              onChange={(e) => setMinScoreFilter(Number(e.target.value))}
              className={styles.selectInput}
            >
              {SCORE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Genre Selector */}
          {availableGenres.length > 0 && (
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Genre:</label>
              <select
                value={genreFilter}
                onChange={(e) => setGenreFilter(e.target.value)}
                className={styles.selectInput}
              >
                <option value="ALL">All Genres</option>
                {availableGenres.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Items Counter */}
          <div className={styles.counterBadge}>
            Showing <strong>{filteredItems.length}</strong> titles
            {localCount > 0 && ` • ${localCount} in local library`}
          </div>
        </div>
      </div>

      {/* Grid Container or Empty / Loading State */}
      {isLoading ? (
        <div className={styles.gridContainer}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className={styles.skeletonCard} />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className={styles.emptyState}>
          <FaFilter size={32} style={{ color: 'var(--text-tertiary)' }} />
          <h3 className={styles.emptyTitle}>No matching recommendations found</h3>
          <p className={styles.emptyText}>
            No anime match your currently selected filters. Try lowering the match threshold or clearing the search query.
          </p>
          <Button variant="secondary" size="sm" onClick={handleResetFilters}>
            Reset Filters
          </Button>
        </div>
      ) : (
        <div className={styles.gridContainer}>
          {filteredItems.map((item) => (
            <RecommendationCard
              key={`${item.sourceType}-${item.showId}`}
              item={item}
              onOpenDetails={handleOpenDetails}
              onDismiss={handleDismiss}
            />
          ))}
        </div>
      )}

      {/* Score Breakdown Modal */}
      <ScoreBreakdownModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        item={modalItem}
        onDismiss={(item) => handleDismiss(item.showId)}
      />
    </div>
  )
}

export default Recommendations
