import React, { useState, useMemo, useEffect, useRef } from 'react'
import { FaChevronDown, FaChevronUp } from 'react-icons/fa'
import styles from './EpisodeList.module.css'

interface EpisodeListProps {
  episodes: string[]
  themeSongs?: string[]
  currentEpisode?: string
  watchedEpisodes: string[]
  onEpisodeClick: (ep: string) => void
  variant?: 'sidebar' | 'drawer'
  availableEpisodesDetail?: Array<{
    number: string
    title?: string
    thumbnail?: string
    isLocal?: boolean
  }>
  isCollapsed?: boolean
  onToggleCollapse?: () => void
}

const EpisodeList = ({
  episodes,
  themeSongs,
  currentEpisode,
  watchedEpisodes,
  onEpisodeClick,
  variant = 'sidebar',
  availableEpisodesDetail,
  isCollapsed: controlledCollapsed,
  onToggleCollapse,
}: EpisodeListProps) => {
  const [selectedRange, setSelectedRange] = useState(0)
  const activeItemRef = useRef<HTMLDivElement>(null)

  const isCurrentThemeSong = useMemo(() => {
    if (!currentEpisode || !themeSongs) return false
    return (
      themeSongs.includes(currentEpisode) ||
      currentEpisode.startsWith('OP') ||
      currentEpisode.startsWith('ED')
    )
  }, [currentEpisode, themeSongs])

  const [activeTab, setActiveTab] = useState<'episodes' | 'themeSongs'>(() => {
    return isCurrentThemeSong ? 'themeSongs' : 'episodes'
  })

  useEffect(() => {
    if (isCurrentThemeSong) {
      setActiveTab('themeSongs')
    } else if (currentEpisode) {
      setActiveTab('episodes')
    }
  }, [isCurrentThemeSong, currentEpisode])

  const [uncontrolledCollapsed, setUncontrolledCollapsed] = useState(false)
  const isCollapsed =
    controlledCollapsed !== undefined ? controlledCollapsed : uncontrolledCollapsed

  const handleToggleCollapse = () => {
    if (onToggleCollapse) {
      onToggleCollapse()
    } else {
      setUncontrolledCollapsed((prev) => !prev)
    }
  }

  const handleTabClick = (tab: 'episodes' | 'themeSongs') => {
    if (activeTab === tab) {
      handleToggleCollapse()
    } else {
      setActiveTab(tab)
      if (isCollapsed) {
        handleToggleCollapse()
      }
    }
  }

  useEffect(() => {
    if (isCollapsed) return
    const item = activeItemRef.current
    if (!item) return

    let scroller: HTMLElement | null = item.parentElement
    while (scroller) {
      const style = window.getComputedStyle(scroller)
      if (
        (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        scroller.scrollHeight > scroller.clientHeight
      ) {
        break
      }
      scroller = scroller.parentElement
    }
    if (!scroller) return

    const scrollerRect = scroller.getBoundingClientRect()
    const itemRect = item.getBoundingClientRect()
    scroller.scrollTop +=
      itemRect.top + itemRect.height / 2 - (scrollerRect.top + scroller.clientHeight / 2)
  }, [currentEpisode, selectedRange, activeTab, isCollapsed])

  const episodeRanges = useMemo(() => {
    if (episodes.length <= 100) return []
    const ranges = []
    for (let i = 0; i < episodes.length; i += 100) {
      const start = i + 1
      const end = Math.min(i + 100, episodes.length)
      ranges.push(`${start}-${end}`)
    }
    return ranges
  }, [episodes])

  const filteredEpisodes = useMemo(() => {
    if (episodeRanges.length === 0) return episodes
    const range = episodeRanges[selectedRange]
    const [startStr, endStr] = range.split('-')
    const start = parseInt(startStr, 10)
    const end = parseInt(endStr, 10)
    return episodes.slice(start - 1, end)
  }, [episodes, episodeRanges, selectedRange])

  const hasThemeSongs = Boolean(themeSongs && themeSongs.length > 0)

  return (
    <div
      className={`${styles.episodeListContainer} ${variant === 'drawer' ? styles.drawerContainer : ''}`}
    >
      {hasThemeSongs ? (
        <div className={`${styles.tabsHeader} ${variant === 'drawer' ? styles.drawerHeader : ''}`}>
          <div className={styles.tabGroup} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'episodes'}
              className={`${styles.tabButton} ${activeTab === 'episodes' ? styles.activeTab : ''}`}
              onClick={() => handleTabClick('episodes')}
            >
              <span className={styles.tabLabel}>Episodes</span>
              <span className={styles.tabBadge}>{episodes.length}</span>
              {activeTab === 'episodes' && (
                <span className={styles.tabChevron}>
                  {isCollapsed ? <FaChevronDown size={10} /> : <FaChevronUp size={10} />}
                </span>
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'themeSongs'}
              className={`${styles.tabButton} ${activeTab === 'themeSongs' ? styles.activeTab : ''}`}
              onClick={() => handleTabClick('themeSongs')}
            >
              <span className={styles.tabLabel}>Theme Songs</span>
              <span className={styles.tabBadge}>{themeSongs!.length}</span>
              {activeTab === 'themeSongs' && (
                <span className={styles.tabChevron}>
                  {isCollapsed ? <FaChevronDown size={10} /> : <FaChevronUp size={10} />}
                </span>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`${styles.singleHeader} ${variant === 'drawer' ? styles.drawerHeader : ''}`}
          onClick={handleToggleCollapse}
          role="button"
          tabIndex={0}
        >
          <div className={styles.singleHeaderTitleGroup}>
            <h3 className={styles.episodeListTitle}>Episodes</h3>
            <span className={styles.tabBadge}>{episodes.length}</span>
          </div>
          <button
            type="button"
            className={styles.collapseToggleBtn}
            aria-label={isCollapsed ? 'Expand episodes' : 'Collapse episodes'}
          >
            {isCollapsed ? <FaChevronDown size={12} /> : <FaChevronUp size={12} />}
          </button>
        </div>
      )}

      {!isCollapsed && activeTab === 'episodes' && episodeRanges.length > 0 && (
        <div className={styles.rangeSelector}>
          {episodeRanges.map((range, index) => (
            <button
              key={range}
              type="button"
              className={`${styles.rangeButton} ${selectedRange === index ? styles.active : ''}`}
              onClick={() => setSelectedRange(index)}
            >
              {range}
            </button>
          ))}
        </div>
      )}

      {!isCollapsed && (
        <div className={`${styles.episodeList} ${variant === 'drawer' ? styles.drawerList : ''}`}>
          {activeTab === 'episodes' ? (
            filteredEpisodes.map((ep) => {
              const detail = availableEpisodesDetail?.find((d) => d.number === ep)
              const isLocal = detail?.isLocal
              return (
                <div
                  key={ep}
                  ref={ep === currentEpisode ? activeItemRef : undefined}
                  className={`${styles.episodeItem} ${watchedEpisodes.includes(ep) ? styles.watched : ''} ${ep === currentEpisode ? styles.active : ''}`}
                  onClick={() => onEpisodeClick(ep)}
                >
                  <span>Episode {ep}</span>
                  {isLocal && <span className={styles.localBadge}>Local</span>}
                </div>
              )
            })
          ) : (
            themeSongs?.map((ts) => {
              const detail = availableEpisodesDetail?.find((d) => d.number === ts)
              const title = detail?.title ? `${ts} - ${detail.title}` : ts
              return (
                <div
                  key={ts}
                  ref={ts === currentEpisode ? activeItemRef : undefined}
                  className={`${styles.episodeItem} ${watchedEpisodes.includes(ts) ? styles.watched : ''} ${ts === currentEpisode ? styles.active : ''}`}
                  onClick={() => onEpisodeClick(ts)}
                >
                  <span title={title}>{title}</span>
                  <span className={styles.localBadge}>Local</span>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

export default EpisodeList
