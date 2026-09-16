import React from 'react'
import type { AsmrWork } from '../../hooks/useAsmr'
import styles from './Asmr.module.css'

interface AsmrCardProps {
  work: AsmrWork
  onSelect: (work: AsmrWork) => void
}

const AsmrCard: React.FC<AsmrCardProps> = ({ work, onSelect }) => {
  const thumbSrc =
    work.thumbnail &&
    !work.thumbnail.startsWith('/api/proxy') &&
    (work.thumbnail.startsWith('http://') || work.thumbnail.startsWith('https://'))
      ? `/api/proxy?url=${encodeURIComponent(work.thumbnail)}&referer=${encodeURIComponent('https://japaneseasmr.com/')}`
      : work.thumbnail

  return (
    <button className={styles.card} onClick={() => onSelect(work)} title={work.name}>
      <div className={styles.thumbWrap}>
        {thumbSrc ? (
          <img
            className={styles.thumb}
            src={thumbSrc}
            alt={work.name}
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div className={`${styles.thumb} ${styles.thumbPlaceholder}`}>
            <span>No Image</span>
          </div>
        )}
        {work.isAdult && <span className={styles.adultBadge}>18+</span>}
      </div>
      <p className={styles.cardTitle}>{work.name}</p>
      <p className={styles.cardMeta}>{work.id}</p>
    </button>
  )
}

export default AsmrCard
