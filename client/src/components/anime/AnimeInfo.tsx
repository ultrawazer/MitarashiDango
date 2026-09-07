import React from 'react'
import { useParams, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import {
  FaPlay,
  FaPlus,
  FaCheck,
  FaChevronDown,
  FaChevronUp,
  FaStar,
  FaTv,
  FaLayerGroup,
  FaMusic,
} from 'react-icons/fa'
import { useState, useMemo, useEffect } from 'react'
import { useAnimeInfoData } from '../../hooks/useAnimeInfoData'
import { fixThumbnailUrl } from '../../lib/utils'
import { useTitlePreference } from '../../contexts/TitlePreferenceContext'
import GenericModal from '../common/GenericModal'
import { Button } from '../common/Button'
import { useMatureConsent } from '../../hooks/useMatureConsent'
import { fetchApi } from '../../lib/fetchApi'
import styles from './AnimeInfo.module.css'
import AnimeMetaDetails from './AnimeMetaDetails'
import SynopsisText from './SynopsisText'
import QueueOptionsButton from './QueueOptionsButton'

export default function AnimeInfo() {
  const { id: showId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { titlePreference } = useTitlePreference()
  const [showDetails, setShowDetails] = useState(false)

  const { showMeta, loadingMeta, toggleWatchlist, inWatchlist } = useAnimeInfoData(showId)
  const { hasConsent: hasMatureConsent, grant: grantMatureConsent } = useMatureConsent()

  const { data: episodesData, isLoading: loadingEpisodes } = useQuery<{
    episodes: string[]
    themeSongs?: string[]
    availableEpisodesDetail?: Array<{
      number: string
      title?: string
      thumbnail?: string
      isLocal?: boolean
    }>
  }>({
    queryKey: ['episodes', showId],
    queryFn: async () => {
      if (!showId) return { episodes: [] }
      return fetchApi(`/api/episodes?showId=${showId}`)
    },
    enabled: !!showId,
  })

  useEffect(() => {
    if (showId && showMeta?.id && showMeta.id !== showId) {
      navigate(`/anime/${showMeta.id}`, { replace: true })
    }
  }, [showId, showMeta, navigate])

  const getDisplayTitle = () => {
    if (!showMeta?.name) return ''
    if (titlePreference === 'name') return showMeta.name
    if (titlePreference === 'nativeName') return showMeta.names?.native || showMeta.name
    if (titlePreference === 'englishName') return showMeta.names?.english || showMeta.name
    return showMeta.name
  }

  const handleStartWatching = () => {
    if (showId) navigate(`/watch/${showId}`)
  }

  const bannerUrl = useMemo(() => {
    if (showMeta?.bannerImage) return fixThumbnailUrl(showMeta.bannerImage)
    if (!showMeta?.thumbnail) return ''
    return fixThumbnailUrl(showMeta.thumbnail, 1200, 450)
  }, [showMeta?.bannerImage, showMeta?.thumbnail])

  if (loadingMeta || !showMeta?.name) {
    return (
      <div className={styles.container}>
        <div className={styles.heroSkeleton}>
          <div className={styles.skeletonBanner} />
          <div className={styles.skeletonContent}>
            <div className={styles.skeletonPoster} />
            <div className={styles.skeletonInfo}>
              <div className={styles.skeletonTitle} />
              <div className={styles.skeletonMeta} />
              <div className={styles.skeletonDesc} />
              <div className={styles.skeletonActions} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  const matureBlocked = showMeta.isAdult === true && !hasMatureConsent

  return (
    <div
      className={styles.container}
      style={
        matureBlocked
          ? { filter: 'blur(14px)', pointerEvents: 'none', userSelect: 'none' }
          : undefined
      }
    >
      <div className={styles.heroSection}>
        <div className={styles.bannerContainer}>
          <div className={styles.banner} style={{ backgroundImage: `url(${bannerUrl})` }} />
          <div className={styles.bannerOverlay} />
        </div>

        <div className={styles.heroContent}>
          <div className={styles.posterContainer}>
            <img
              src={fixThumbnailUrl(showMeta.thumbnail || '', 320, 480)}
              alt={showMeta.name}
              className={styles.poster}
            />
          </div>

          <div className={styles.infoGlass}>
            <div className={styles.topInfo}>
              <h1 className={styles.title}>{getDisplayTitle()}</h1>

              <div className={styles.quickMeta}>
                {showMeta.score && (
                  <div className={styles.metaItem}>
                    <FaStar className={styles.iconStar} />
                    <span>{showMeta.score}</span>
                  </div>
                )}
                {showMeta.status && (
                  <div className={styles.metaItem}>
                    <FaTv className={styles.iconTv} />
                    <span>{showMeta.status}</span>
                  </div>
                )}
                {showMeta.type && (
                  <div className={styles.metaItem}>
                    <FaLayerGroup className={styles.iconType} />
                    <span>{showMeta.type}</span>
                  </div>
                )}
              </div>

              {Array.isArray(showMeta.genres) && showMeta.genres.length > 0 && (
                <div className={styles.genres}>
                  {showMeta.genres
                    .filter(Boolean)
                    .slice(0, 5)
                    .map((g) => {
                      const genreName = typeof g === 'string' ? g : g?.name
                      return (
                        <span key={genreName} className={styles.genre}>
                          {genreName}
                        </span>
                      )
                    })}
                </div>
              )}
            </div>

            <div className={styles.synopsisSection}>
              <h2 className={styles.sectionTitleSmall}>Synopsis</h2>
              <SynopsisText
                text={showMeta.description ? showMeta.description.replace(/<[^>]*>?/gm, '') : ''}
                emptyText="No description available."
              />
            </div>

            <div className={styles.actions}>
              <button className={styles.watchBtn} onClick={handleStartWatching}>
                <FaPlay size={14} />
                Start Watching
              </button>
              <button
                className={`${styles.watchlistBtn} ${inWatchlist ? styles.active : ''}`}
                onClick={toggleWatchlist}
              >
                {inWatchlist ? <FaCheck size={14} /> : <FaPlus size={14} />}
                {inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
              </button>
              <QueueOptionsButton
                showId={showId}
                showName={showMeta.name || showMeta.names?.romaji}
                showThumbnail={showMeta.thumbnail}
                nativeName={showMeta.names?.native}
                englishName={showMeta.names?.english}
                showType={showMeta.type}
                className={styles.watchlistBtn}
                activeClassName={styles.active}
              />
            </div>
          </div>
        </div>
      </div>

      <div className={styles.detailsSection}>
        <button
          className={styles.detailsToggleBtn}
          onClick={() => {
            setShowDetails(!showDetails)
          }}
        >
          {showDetails ? <FaChevronUp /> : <FaChevronDown />}
          {showDetails ? 'Hide Details' : 'Show Details'}
        </button>

        {showDetails && (
          <div className={styles.expandedContent}>
            <AnimeMetaDetails showMeta={showMeta} styles={styles} />
          </div>
        )}
      </div>

      {/* Episodes Section */}
      <div style={{ maxWidth: '1200px', margin: 'var(--space-8) auto var(--space-16)', padding: '0 var(--space-6)' }}>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FaLayerGroup size={18} style={{ color: 'var(--primary-color, #a855f7)' }} />
          Episodes {episodesData?.episodes ? `(${episodesData.episodes.length})` : ''}
        </h2>
        {loadingEpisodes ? (
          <div style={{ color: 'var(--text-secondary)', padding: 'var(--space-4) 0' }}>Loading episodes...</div>
        ) : !episodesData?.episodes || episodesData.episodes.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', padding: 'var(--space-4) 0' }}>No episodes found.</div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 'var(--space-4)',
            marginTop: 'var(--space-4)'
          }}>
            {episodesData.episodes.map((epNum) => {
              const detail = episodesData.availableEpisodesDetail?.find((d) => String(d.number) === String(epNum))
              return (
                <div
                  key={`info-ep-${epNum}`}
                  onClick={() => navigate(`/watch/${showId}/${epNum}`)}
                  style={{
                    background: 'var(--bg-secondary, rgba(255,255,255,0.04))',
                    border: '1px solid var(--border-secondary, rgba(255,255,255,0.08))',
                    borderRadius: 'var(--radius-md, 8px)',
                    padding: 'var(--space-3)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--primary-color, #a855f7)'
                    e.currentTarget.style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-secondary, rgba(255,255,255,0.08))'
                    e.currentTarget.style.transform = 'none'
                  }}
                >
                  {detail?.thumbnail ? (
                    <img
                      src={detail.thumbnail}
                      alt={`Episode ${epNum}`}
                      style={{ width: '80px', height: '50px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }}
                    />
                  ) : (
                    <div style={{
                      width: '80px',
                      height: '50px',
                      background: 'rgba(255,255,255,0.05)',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <FaPlay size={14} style={{ color: 'var(--text-tertiary)' }} />
                    </div>
                  )}
                  <div style={{ overflow: 'hidden', flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                        Episode {epNum}
                      </span>
                      {detail?.isLocal && (
                        <span style={{
                          background: 'linear-gradient(135deg, #10b981, #059669)',
                          color: '#fff',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          padding: '1px 5px',
                          borderRadius: '4px'
                        }}>
                          LOCAL
                        </span>
                      )}
                    </div>
                    {detail?.title && (
                      <div style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        marginTop: '2px'
                      }}>
                        {detail.title}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Theme Songs Section */}
        {episodesData?.themeSongs && episodesData.themeSongs.length > 0 && (
          <div style={{ marginTop: 'var(--space-8)' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FaMusic size={16} style={{ color: 'var(--primary-color, #a855f7)' }} />
              Theme Songs ({episodesData.themeSongs.length})
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 'var(--space-4)',
              marginTop: 'var(--space-4)'
            }}>
              {episodesData.themeSongs.map((ts) => {
                const detail = episodesData.availableEpisodesDetail?.find((d) => String(d.number) === String(ts))
                const title = detail?.title ? `${ts} - ${detail.title}` : ts
                return (
                  <div
                    key={`info-ts-${ts}`}
                    onClick={() => navigate(`/watch/${showId}/${ts}`)}
                    style={{
                      background: 'var(--bg-secondary, rgba(255,255,255,0.04))',
                      border: '1px solid var(--border-secondary, rgba(255,255,255,0.08))',
                      borderRadius: 'var(--radius-md, 8px)',
                      padding: 'var(--space-3)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--primary-color, #a855f7)'
                      e.currentTarget.style.transform = 'translateY(-2px)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-secondary, rgba(255,255,255,0.08))'
                      e.currentTarget.style.transform = 'none'
                    }}
                  >
                    {detail?.thumbnail ? (
                      <img
                        src={detail.thumbnail}
                        alt={title}
                        style={{ width: '80px', height: '50px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }}
                      />
                    ) : (
                      <div style={{
                        width: '80px',
                        height: '50px',
                        background: 'rgba(255,255,255,0.05)',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <FaMusic size={14} style={{ color: 'var(--text-tertiary)' }} />
                      </div>
                    )}
                    <div style={{ overflow: 'hidden', flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                          {ts}
                        </span>
                        <span style={{
                          background: 'linear-gradient(135deg, #10b981, #059669)',
                          color: '#fff',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          padding: '1px 5px',
                          borderRadius: '4px'
                        }}>
                          LOCAL
                        </span>
                      </div>
                      {detail?.title && (
                        <div style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-secondary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          marginTop: '2px'
                        }}>
                          {detail.title}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {matureBlocked && (
        <GenericModal isOpen title="Content Warning" onClose={() => navigate('/home')}>
          <div style={{ padding: '1rem', textAlign: 'center' }}>
            <p>This title contains mature content intended for adult audiences.</p>
            <p>
              By proceeding, you confirm that you are <strong>18 years of age or older</strong> (or
              the age of majority in your jurisdiction) and wish to view this content.
            </p>
            <div
              style={{
                marginTop: '1rem',
                display: 'flex',
                gap: '10px',
                justifyContent: 'center',
              }}
            >
              <Button variant="secondary" onClick={() => navigate('/home')}>
                Go Back
              </Button>
              <Button onClick={grantMatureConsent}>I'm 18+, Continue</Button>
            </div>
          </div>
        </GenericModal>
      )}
    </div>
  )
}
