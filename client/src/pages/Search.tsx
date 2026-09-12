import React, { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import {
  FaSearch,
  FaFilter,
  FaChevronDown,
  FaChevronUp,
  FaChevronLeft,
  FaChevronRight,
  FaGlobe,
} from 'react-icons/fa'
import AnimeCard from '../components/anime/AnimeCard'
import SkeletonGrid from '../components/common/SkeletonGrid'
import { Button } from '../components/common/Button'
import ErrorMessage from '../components/common/ErrorMessage'
import { usePaginatedSearchAnime, useGenresAndStudios } from '../hooks/useAnimeData'
import { useLowEndMode } from '../contexts/LowEndModeContext'
import { hideVirtualKeyboard } from '../hooks/useVirtualKeyboard'
import { useSetting } from '../hooks/useSettings'
import { useMatureConsent } from '../hooks/useMatureConsent'
import GenericModal from '../components/common/GenericModal'
import styles from './Search.module.css'

interface Option {
  value: string
  label: string
}

const typeOptions: Option[] = [
  { value: 'ALL', label: 'All Types' },
  { value: 'TV', label: 'TV Series' },
  { value: 'Movie', label: 'Movie' },
  { value: 'OVA', label: 'OVA' },
  { value: 'ONA', label: 'ONA' },
  { value: 'TV_SHORT', label: 'TV Short' },
  { value: 'SPECIAL', label: 'Special' },
  { value: 'ADULT', label: 'Mature' },
]

const seasonOptions: Option[] = [
  { value: 'ALL', label: 'All Seasons' },
  { value: 'Winter', label: 'Winter' },
  { value: 'Spring', label: 'Spring' },
  { value: 'Summer', label: 'Summer' },
  { value: 'Fall', label: 'Fall' },
]

const countryOptions: Option[] = [
  { value: 'ALL', label: 'All Countries' },
  { value: 'JP', label: 'Japan' },
  { value: 'CN', label: 'China' },
]

const sortOptions: Option[] = [
  { value: 'POPULARITY_DESC', label: 'Popularity' },
  { value: 'TRENDING_DESC', label: 'Trending' },
  { value: 'SCORE_DESC', label: 'Score' },
  { value: 'START_DATE_DESC', label: 'Newest' },
  { value: 'START_DATE_ASC', label: 'Oldest' },
  { value: 'EPISODES_DESC', label: 'Most Episodes' },
  { value: 'FAVOURITES_DESC', label: 'Favourites' },
]

const anilistStatusOptions: Option[] = [
  { value: 'RELEASING', label: 'Currently Airing' },
  { value: 'FINISHED', label: 'Finished' },
  { value: 'NOT_YET_RELEASED', label: 'Not Yet Released' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'HIATUS', label: 'Hiatus' },
]

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('query') || '')
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1'))

  const [type, setType] = useState(searchParams.get('type') || 'ALL')
  const [season, setSeason] = useState(searchParams.get('season') || 'ALL')
  const [year, setYear] = useState(searchParams.get('year') || 'ALL')
  const [country, setCountry] = useState(searchParams.get('country') || 'ALL')
  const [provider, setProvider] = useState(searchParams.get('provider') || 'anilist')
  const [sort, setSort] = useState(searchParams.get('sortBy') || 'POPULARITY_DESC')
  const [status, setStatus] = useState(searchParams.get('status') || '')
  const [showFilters, setShowFilters] = useState(false)

  // Media Mode & Local vs Web search state
  const { data: mediaModeSetting } = useSetting('media_mode')
  const mediaMode = (mediaModeSetting as 'local' | 'mixed' | 'web') || 'web'
  const isLocalActive = mediaMode === 'local' || mediaMode === 'mixed'
  const [searchWebToo, setSearchWebToo] = useState<boolean>(() => {
    return searchParams.get('web') === 'true'
  })

  useEffect(() => {
    if (type === 'TV_SHORT') {
      setType('ALL')
    }
  }, [type])
  const { lowEndMode } = useLowEndMode()
  const resultsRef = useRef<HTMLDivElement>(null)

  const { data: metaData } = useGenresAndStudios()
  const availableGenres = metaData?.genres || []

  const [anilistGenreState, setAnilistGenreState] = useState<{
    [key: string]: 'include' | 'exclude'
  }>(() => {
    const states: { [key: string]: 'include' | 'exclude' } = {}
    const genres = searchParams.get('genres')?.split(',') || []
    const exclude = searchParams.get('excludeGenres')?.split(',') || []
    genres.forEach((g) => g && (states[g] = 'include'))
    exclude.forEach((g) => g && (states[g] = 'exclude'))
    return states
  })

  // We only pass filters that are NOT 'page' to usePaginatedSearchAnime
  const filterParams = new URLSearchParams(searchParams)
  filterParams.delete('page')
  const filterString = filterParams.toString()

  // Local Shoko query
  const {
    data: localResults = [],
    isLoading: isLocalLoading,
    isError: isLocalError,
    error: localError,
  } = useQuery<any[]>({
    queryKey: ['shoko-search', query, type],
    queryFn: async () => {
      const p = new URLSearchParams()
      if (query.trim()) p.set('query', query.trim())
      if (type !== 'ALL') p.set('type', type)
      const res = await fetch(`/api/shoko/search?${p.toString()}`)
      if (!res.ok) throw new Error('Failed to search local series')
      return res.json()
    },
    enabled: isLocalActive,
    staleTime: 30 * 1000,
  })

  // Web query
  const shouldFetchWeb = !isLocalActive || searchWebToo
  const {
    data: results = [],
    isLoading,
    isError,
    error,
  } = usePaginatedSearchAnime(shouldFetchWeb ? filterString : '', page, 14)

  const { data: nextPageData } = usePaginatedSearchAnime(
    shouldFetchWeb ? filterString : '',
    page + 1,
    14
  )

  const { hasConsent, grant: grantMatureConsent } = useMatureConsent()
  const [showMatureModal, setShowMatureModal] = useState(false)
  const [pendingMatureAction, setPendingMatureAction] = useState<(() => void) | null>(null)
  const showMature = hasConsent

  const handleAcceptMature = () => {
    grantMatureConsent()
    setShowMatureModal(false)
    if (pendingMatureAction) {
      pendingMatureAction()
      setPendingMatureAction(null)
    }
  }

  const handleDeclineMature = () => {
    setShowMatureModal(false)
    setPendingMatureAction(null)
    if (type === 'ADULT') {
      setType('ALL')
    }
  }

  const filteredResults = React.useMemo(() => {
    if (isLocalActive && !searchWebToo) {
      return localResults
    }

    let web = results
    const isAdultSearch = type === 'ADULT' || query.trim().toLowerCase() === 'mature'
    if (provider === 'anilist' && !isAdultSearch && !showMature) {
      web = results.filter((anime) => {
        const isAdult =
          anime.isAdult ||
          anime.rating === 'R+' ||
          anime.rating === 'Rx' ||
          anime.rating?.includes('17+')
        return !isAdult
      })
    }

    if (isLocalActive && searchWebToo) {
      const localIds = new Set(localResults.map((l) => String(l.id)))
      const localAnilistIds = new Set(
        localResults.filter((l) => l.anilistId).map((l) => String(l.anilistId))
      )
      const nonDuplicateWeb = web.filter(
        (w) => !localIds.has(String(w.id)) && !localAnilistIds.has(String(w.id))
      )
      return [...localResults, ...nonDuplicateWeb]
    }

    return web
  }, [isLocalActive, searchWebToo, localResults, results, provider, type, showMature])

  const isLocalOnly = isLocalActive && !searchWebToo
  const totalLocalPages = Math.ceil(filteredResults.length / 14) || 1

  const pagedResults = React.useMemo(() => {
    if (isLocalOnly) {
      const start = (page - 1) * 14
      return filteredResults.slice(start, start + 14)
    }
    return filteredResults
  }, [isLocalOnly, filteredResults, page])

  const combinedLoading = isLocalActive
    ? searchWebToo
      ? isLocalLoading || isLoading
      : isLocalLoading
    : isLoading

  const combinedError = isLocalActive
    ? searchWebToo
      ? localError || error
      : localError
    : error

  const isCombinedError = isLocalActive
    ? searchWebToo
      ? isLocalError || isError
      : isLocalError
    : isError

  useEffect(() => {
    setQuery(searchParams.get('query') || '')
    setType(searchParams.get('type') || 'ALL')
    setSeason(searchParams.get('season') || 'ALL')
    setYear(searchParams.get('year') || 'ALL')
    setCountry(searchParams.get('country') || 'ALL')
    setProvider(searchParams.get('provider') || 'anilist')
    setSort(searchParams.get('sortBy') || 'POPULARITY_DESC')
    setStatus(searchParams.get('status') || '')
    setPage(parseInt(searchParams.get('page') || '1'))
    setSearchWebToo(searchParams.get('web') === 'true')

    const states: { [key: string]: 'include' | 'exclude' } = {}
    const genres = searchParams.get('genres')?.split(',') || []
    const exclude = searchParams.get('excludeGenres')?.split(',') || []
    genres.forEach((g) => g && (states[g] = 'include'))
    exclude.forEach((g) => g && (states[g] = 'exclude'))
    setAnilistGenreState(states)
  }, [searchParams])

  const handleSearch = (newPage = 1) => {
    hideVirtualKeyboard()

    const params = new URLSearchParams()
    if (query.trim()) params.set('query', query.trim())

    if (type !== 'ALL') params.set('type', type)
    if (status) params.set('status', status)
    if (season !== 'ALL') params.set('season', season)
    if (year !== 'ALL') params.set('year', year)
    if (country !== 'ALL') params.set('country', country)
    if (sort !== 'POPULARITY_DESC') params.set('sortBy', sort)

    const anilistGenres = Object.entries(anilistGenreState)
      .filter(([, s]) => s === 'include')
      .map(([g]) => g)
    const anilistExclude = Object.entries(anilistGenreState)
      .filter(([, s]) => s === 'exclude')
      .map(([g]) => g)

    if (anilistGenres.length > 0) params.set('genres', anilistGenres.join(','))
    if (anilistExclude.length > 0) params.set('excludeGenres', anilistExclude.join(','))
    const isAdultQuery = type === 'ADULT' || query.trim().toLowerCase() === 'mature'
    if (isAdultQuery) {
      params.set('adult', 'true')
    } else if (!showMature) {
      params.set('adult', 'false')
    }

    params.set('provider', 'anilist')
    if (searchWebToo) params.set('web', 'true')

    if (newPage > 1) params.set('page', newPage.toString())

    setSearchParams(params)
    if (newPage !== page) {
      setPage(newPage)
    }
  }

  const handlePageChange = (newPage: number) => {
    handleSearch(newPage)
    if (resultsRef.current) {
      const y = resultsRef.current.getBoundingClientRect().top + window.scrollY - 100
      window.scrollTo({ top: y, behavior: 'smooth' })
    }
  }

  const currentYear = new Date().getFullYear()
  const yearOptions: Option[] = [
    { value: 'ALL', label: 'All Years' },
    ...Array.from({ length: currentYear - 1980 + 1 }, (_, i) => ({
      value: String(currentYear - i),
      label: String(currentYear - i),
    })),
  ]

  const canGoNext = isLocalOnly
    ? page < totalLocalPages
    : results.length >= 14 && nextPageData && nextPageData.length > 0

  return (
    <div className="page-container">
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>Search Anime</h1>
        <p className={styles.pageSubtitle}>
          Search through thousands of titles and discover your next favorite
        </p>
      </div>

      <div className={styles.filterContainer}>
        <div className={styles.searchBarWrapper}>
          <div className={styles.inputIconWrapper}>
            <FaSearch className={styles.searchIcon} />
            <input
              type="text"
              data-virtual-keyboard="true"
              className={styles.searchInput}
              placeholder="Search by title, character, or studio..."
              value={query}
              onInput={(e) => setQuery(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <div className={styles.searchActions}>
            {isLocalActive && (
              <label className={styles.webSearchToggle} title="Search AniList web catalog too">
                <input
                  type="checkbox"
                  checked={searchWebToo}
                  onChange={(e) => {
                    const nextVal = e.target.checked
                    setSearchWebToo(nextVal)
                    const nextParams = new URLSearchParams(searchParams)
                    if (nextVal) {
                      nextParams.set('web', 'true')
                    } else {
                      nextParams.delete('web')
                    }
                    setSearchParams(nextParams)
                  }}
                />
                <FaGlobe className={styles.webIcon} />
                <span>Search Web too</span>
              </label>
            )}

            <label className={styles.webSearchToggle} title="Include mature (18+) content in search results">
              <input
                type="checkbox"
                checked={hasConsent}
                onChange={(e) => {
                  if (e.target.checked && !hasConsent) {
                    setShowMatureModal(true)
                    setPendingMatureAction(() => () => handleSearch(1))
                  } else if (!e.target.checked) {
                    localStorage.removeItem('agreedToViewMature')
                    window.location.reload()
                  }
                }}
              />
              <span>18+ Mature</span>
            </label>

            <Button onClick={() => handleSearch()} className={styles.searchBtn}>
              Search
            </Button>
            <button
              className={`${styles.filterToggleBtn} ${showFilters ? styles.active : ''}`}
              onClick={() => setShowFilters(!showFilters)}
            >
              <FaFilter size={14} />
              <span>Filters</span>
              {showFilters ? <FaChevronUp size={12} /> : <FaChevronDown size={12} />}
            </button>
          </div>
        </div>

        <div className={`${styles.advancedFilters} ${showFilters ? styles.show : ''}`}>
          <div className={styles.filterDivider} />
          <div className={styles.filterGrid}>
            <div className={styles.filterItem}>
              <label>Type</label>
              <select
                value={type}
                onChange={(e) => {
                  const val = e.currentTarget.value
                  if (val === 'ADULT' && !hasConsent) {
                    setShowMatureModal(true)
                    setPendingMatureAction(() => () => {
                      setType('ADULT')
                      handleSearch(1)
                    })
                    return
                  }
                  setType(val)
                }}
              >
                {typeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.filterItem}>
              <label>Status</label>
              <select value={status} onChange={(e) => setStatus(e.currentTarget.value)}>
                <option value="">All Status</option>
                {anilistStatusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.filterItem}>
              <label>Season</label>
              <select value={season} onChange={(e) => setSeason(e.currentTarget.value)}>
                {seasonOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.filterItem}>
              <label>Year</label>
              <select value={year} onChange={(e) => setYear(e.currentTarget.value)}>
                {yearOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.filterItem}>
              <label>Country</label>
              <select value={country} onChange={(e) => setCountry(e.currentTarget.value)}>
                {countryOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.filterItem}>
              <label>Sort By</label>
              <select value={sort} onChange={(e) => setSort(e.currentTarget.value)}>
                {sortOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {availableGenres.length > 0 && (
            <div className={styles.genreSection}>
              <label className={styles.genreLabel}>Genres</label>
              <div className={styles.genreContainer}>
                {availableGenres.map((g) => (
                  <button
                    key={g}
                    className={`${styles.genreButton} ${styles[anilistGenreState[g] || '']}`}
                    onClick={() => {
                      setAnilistGenreState((prev) => {
                        const current = prev[g]
                        const newState = { ...prev }
                        if (current === 'include') {
                          newState[g] = 'exclude'
                        } else if (current === 'exclude') {
                          delete newState[g]
                        } else {
                          newState[g] = 'include'
                        }
                        return newState
                      })
                    }}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={styles.filterActions}>
            <Button
              variant="secondary"
              onClick={() => {
                setAnilistGenreState({})
                setType('ALL')
                setSeason('ALL')
                setYear('ALL')
                setCountry('ALL')
                setSort('POPULARITY_DESC')
                setStatus('')
                setShowMature(false)
              }}
            >
              Reset All
            </Button>
            <Button onClick={() => handleSearch()} className={styles.applyBtn}>
              Apply Filters
            </Button>
          </div>
        </div>
      </div>

      {isError && <ErrorMessage message={error?.message || 'Error'} />}

      {(type !== 'ALL' ||
        season !== 'ALL' ||
        year !== 'ALL' ||
        Object.keys(anilistGenreState).length > 0) && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            alignItems: 'center',
            marginBottom: '1.5rem',
          }}
        >
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            Active Filters:
          </span>

          {type !== 'ALL' && (
            <span
              className="badge badge-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              Type: {type}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  setType('ALL')
                  handleSearch()
                }}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
              >
                ✕
              </button>
            </span>
          )}

          {season !== 'ALL' && (
            <span
              className="badge badge-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              Season: {season}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  setSeason('ALL')
                  handleSearch()
                }}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
              >
                ✕
              </button>
            </span>
          )}

          {year !== 'ALL' && (
            <span
              className="badge badge-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              Year: {year}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  setYear('ALL')
                  handleSearch()
                }}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
              >
                ✕
              </button>
            </span>
          )}

          {Object.entries(anilistGenreState).map(([genre, state]) => (
            <span
              key={genre}
              className={`badge ${state === 'include' ? 'badge-primary' : 'badge-danger'}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              {state === 'include' ? `+ ${genre}` : `- ${genre}`}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  setAnilistGenreState((prev) => {
                    const copy = { ...prev }
                    delete copy[genre]
                    return copy
                  })
                  handleSearch()
                }}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <div className={styles.resultsHeader} ref={resultsRef}>
        <h2 className={styles.resultsTitle}>
          {query ? `Search Results for "${query}"` : isLocalOnly ? 'Local Library Anime' : 'Discover Anime'}
          {isLocalOnly && <span className={styles.localScopeBadge}>Local Shoko</span>}
        </h2>

        {pagedResults.length > 0 && (
          <div className={styles.pagination}>
            <button
              className={styles.pageBtn}
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 1 || combinedLoading}
              aria-label="Previous page"
            >
              <FaChevronLeft size={14} />
            </button>
            <span className={styles.pageInfo}>
              Page <strong>{page}</strong>
            </span>
            <button
              className={styles.pageBtn}
              onClick={() => handlePageChange(page + 1)}
              disabled={!canGoNext || combinedLoading}
              aria-label="Next page"
            >
              <FaChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      <div className={`${styles.resultsGrid} ${lowEndMode ? styles.lowEnd : ''}`}>
        {combinedLoading ? (
          <SkeletonGrid />
        ) : (
          pagedResults.map((anime) => <AnimeCard key={anime._id} anime={anime} />)
        )}
      </div>

      {!combinedLoading && pagedResults.length === 0 && (
        <div className={styles.noResults}>
          <FaSearch size={48} className={styles.noResultsIcon} />
          <h3>No results found</h3>
          <p>
            {isLocalOnly
              ? 'No matching series found in your local Shoko library. Try toggling "Search Web too" to search online.'
              : "Try adjusting your search or filters to find what you're looking for."}
          </p>
        </div>
      )}

      {pagedResults.length > 0 && (
        <div className={styles.bottomPagination}>
          <div className={styles.pagination}>
            <button
              className={styles.pageBtn}
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 1 || combinedLoading}
            >
              <FaChevronLeft size={14} />
              <span>Previous</span>
            </button>
            <span className={styles.pageInfo}>
              Page <strong>{page}</strong>
            </span>
            <button
              className={styles.pageBtn}
              onClick={() => handlePageChange(page + 1)}
              disabled={!canGoNext || combinedLoading}
            >
              <span>Next</span>
              <FaChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
      {showMatureModal && (
        <GenericModal
          isOpen={showMatureModal}
          title="Content Warning"
          onClose={handleDeclineMature}
        >
          <div style={{ padding: 'var(--space-4)', textAlign: 'center' }}>
            <p>This section contains mature content intended for adult audiences.</p>
            <p>
              By proceeding, you confirm that you are <strong>18 years of age or older</strong> (or
              the age of majority in your jurisdiction) and wish to view this content.
            </p>
            <p
              style={{
                fontSize: 'var(--font-size-xs)',
                color: 'var(--text-secondary)',
                marginTop: 'var(--space-4)',
              }}
            >
              You can reset this preference at any time in the <strong>Settings</strong> page.
            </p>
            <div
              style={{
                marginTop: 'var(--space-4)',
                display: 'flex',
                gap: 'var(--space-2-5)',
                justifyContent: 'center',
              }}
            >
              <Button variant="secondary" onClick={handleDeclineMature}>
                Go Back
              </Button>
              <Button onClick={handleAcceptMature}>I'm 18+, Continue</Button>
            </div>
          </div>
        </GenericModal>
      )}
    </div>
  )
}
