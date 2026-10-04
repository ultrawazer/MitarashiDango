import React, { useState, useEffect } from 'react'
import { Modal } from '../common/Modal'
import { Button } from '../common/Button'
import { useEligibleRecipients, useSendPeerRecommendation } from '../../hooks/usePeerRecommendations'
import styles from './RecommendToFriendModal.module.css'

interface RecommendToFriendModalProps {
  isOpen: boolean
  onClose: () => void
  anime: {
    id: string
    name: string
    englishName?: string | null
    nativeName?: string | null
    thumbnail?: string | null
    type?: string | null
  } | null
}

export const RecommendToFriendModal: React.FC<RecommendToFriendModalProps> = ({
  isOpen,
  onClose,
  anime,
}) => {
  const { data: recipients = [], isLoading: loadingRecipients } = useEligibleRecipients()
  const sendMutation = useSendPeerRecommendation()

  const [selectedRecipientId, setSelectedRecipientId] = useState<string>('')
  const [note, setNote] = useState<string>('')

  useEffect(() => {
    if (isOpen) {
      setNote('')
      if (recipients.length > 0 && !selectedRecipientId) {
        setSelectedRecipientId(recipients[0].id)
      }
    }
  }, [isOpen, recipients])

  if (!anime) return null

  const handleSend = () => {
    if (!selectedRecipientId) return

    sendMutation.mutate(
      {
        recipientId: selectedRecipientId,
        showId: anime.id,
        showTitle: anime.name,
        showTitleEnglish: anime.englishName,
        showTitleNative: anime.nativeName,
        showThumbnail: anime.thumbnail,
        showType: anime.type,
        note: note.trim() ? note.trim() : null,
      },
      {
        onSuccess: () => {
          onClose()
        },
      }
    )
  }

  const title = anime.englishName || anime.name || 'Anime'

  const footer = (
    <div className={styles.footerActions}>
      <Button variant="secondary" size="sm" onClick={onClose} disabled={sendMutation.isPending}>
        Cancel
      </Button>
      <Button
        variant="primary"
        size="sm"
        onClick={handleSend}
        disabled={!selectedRecipientId || sendMutation.isPending || recipients.length === 0}
      >
        {sendMutation.isPending ? 'Sending...' : 'Send Recommendation'}
      </Button>
    </div>
  )

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Recommend to Friend" footer={footer} width="sm">
      <div className={styles.container}>
        {/* Anime Summary Header */}
        <div className={styles.animeHeader}>
          {anime.thumbnail ? (
            <img src={anime.thumbnail} alt={title} className={styles.animePoster} />
          ) : (
            <div className={styles.animePosterPlaceholder}>No Image</div>
          )}
          <div className={styles.animeInfo}>
            <span className={styles.animeTitle} title={title}>
              {title}
            </span>
            <span className={styles.animeSub}>{anime.type || 'Anime'}</span>
          </div>
        </div>

        {/* Recipient Selection */}
        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="peer-rec-recipient">
            Send to:
          </label>
          {loadingRecipients ? (
            <div className={styles.emptyUsers}>Loading friends...</div>
          ) : recipients.length === 0 ? (
            <div className={styles.emptyUsers}>
              No other active users found on this server to recommend to.
            </div>
          ) : (
            <select
              id="peer-rec-recipient"
              className={styles.recipientSelect}
              value={selectedRecipientId || recipients[0]?.id || ''}
              onChange={(e) => setSelectedRecipientId(e.target.value)}
            >
              {recipients.map((user) => (
                <option key={user.id} value={user.id} className={styles.recipientOption}>
                  {user.displayName} (@{user.username})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Note input */}
        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="peer-rec-note">
            Personal Note (Optional):
          </label>
          <textarea
            id="peer-rec-note"
            className={styles.noteTextarea}
            placeholder="Why should they check this out? (e.g. The animation and music are incredible!)"
            value={note}
            maxLength={280}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className={styles.textareaFooter}>
            <span>{note.length}/280</span>
          </div>
        </div>
      </div>
    </Modal>
  )
}
