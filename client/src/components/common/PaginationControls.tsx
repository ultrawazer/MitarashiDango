import React, { useState, useRef, useEffect, useCallback } from 'react'
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa'
import styles from './PaginationControls.module.css'

export interface PaginationControlsProps {
  page: number
  totalPages?: number
  canGoNext?: boolean
  disabled?: boolean
  onPageChange: (newPage: number) => void
  scrollToRef?: React.RefObject<HTMLElement | null>
  className?: string
}

export const PaginationControls: React.FC<PaginationControlsProps> = ({
  page,
  totalPages,
  canGoNext,
  disabled = false,
  onPageChange,
  scrollToRef,
  className,
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const [inputValue, setInputValue] = useState(String(page))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setInputValue(String(page))
  }, [page])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const executePageChange = useCallback(
    (targetPage: number) => {
      if (targetPage === page) return
      onPageChange(targetPage)
      if (scrollToRef?.current) {
        const y = scrollToRef.current.getBoundingClientRect().top + window.scrollY - 120
        window.scrollTo({ top: y, behavior: 'smooth' })
      }
    },
    [page, onPageChange, scrollToRef]
  )

  const handleStartEdit = () => {
    if (disabled) return
    setInputValue(String(page))
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setInputValue(String(page))
  }

  const handleSubmitEdit = () => {
    setIsEditing(false)
    const rawNum = parseInt(inputValue.trim(), 10)
    if (isNaN(rawNum) || rawNum < 1) {
      setInputValue(String(page))
      return
    }

    let target = rawNum
    if (totalPages && totalPages > 0) {
      target = Math.min(target, totalPages)
    }

    executePageChange(target)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmitEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancelEdit()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (/^\d*$/.test(val)) {
      setInputValue(val)
    }
  }

  const handleLastPageClick = () => {
    if (disabled || !totalPages || page === totalPages) return
    setIsEditing(false)
    executePageChange(totalPages)
  }

  const hasNext = totalPages ? page < totalPages : (canGoNext ?? false)
  const canGoPrevious = page > 1

  return (
    <div className={`${styles.paginationControls} ${className || ''}`}>
      <button
        type="button"
        className={styles.navButton}
        onClick={() => executePageChange(page - 1)}
        disabled={!canGoPrevious || disabled}
        aria-label="Previous page"
        title="Previous page"
      >
        <FaChevronLeft size={14} />
      </button>

      <div className={styles.pageInfoWrapper}>
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onBlur={handleSubmitEdit}
            className={styles.pageInput}
            aria-label="Page number input"
          />
        ) : (
          <button
            type="button"
            className={styles.pageTrigger}
            onClick={handleStartEdit}
            disabled={disabled}
            title="Click to jump to page"
            aria-label={`Page ${page}. Click to jump to page.`}
          >
            {page}
          </button>
        )}

        {totalPages && totalPages > 0 && (
          <>
            <span className={styles.separator}>/</span>
            <button
              type="button"
              className={styles.totalTrigger}
              onClick={handleLastPageClick}
              disabled={disabled || page === totalPages}
              title={page === totalPages ? 'You are on the last page' : `Jump to last page (${totalPages})`}
              aria-label={`Jump to last page ${totalPages}`}
            >
              {totalPages}
            </button>
          </>
        )}
      </div>

      <button
        type="button"
        className={styles.navButton}
        onClick={() => executePageChange(page + 1)}
        disabled={!hasNext || disabled}
        aria-label="Next page"
        title="Next page"
      >
        <FaChevronRight size={14} />
      </button>
    </div>
  )
}
