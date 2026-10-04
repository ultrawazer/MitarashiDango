import React, { useState, useEffect, useRef } from 'react'
import { FaBell } from 'react-icons/fa'
import { useQueryClient } from '@tanstack/react-query'
import NotificationDropdown from './NotificationDropdown'
import {
  useNotifications,
  useDiscoveryStatus,
  useTriggerDiscovery,
  useSystemNotifications,
} from '../../hooks/useAnimeData'
import { usePeerNotifications } from '../../hooks/usePeerRecommendations'
import styles from './Notification.module.css'

const NotificationBell: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const triggerDiscovery = useTriggerDiscovery()

  const { data: notifications = [] } = useNotifications()
  const { data: systemNotifications = [] } = useSystemNotifications()
  const { data: peerNotifications = [] } = usePeerNotifications()
  const { data: discoveryStatus } = useDiscoveryStatus()
  const count = notifications.length + systemNotifications.length + peerNotifications.length

  const displayCount = count > 5 ? '5+' : count

  const wasDiscoveryRunning = useRef(false)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const running = !!discoveryStatus?.running
    if (wasDiscoveryRunning.current && !running) {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['discovery-status'] })
    }
    wasDiscoveryRunning.current = running
  }, [discoveryStatus?.running, queryClient])

  const hasAdminAlert = systemNotifications.some(
    (sn) => sn.type === 'admin-alert' || sn.type === 'security'
  )

  const handleToggle = () => {
    const nextOpen = !isOpen
    setIsOpen(nextOpen)
    if (nextOpen) {
      triggerDiscovery.mutate()
    }
  }

  return (
    <div className={styles.container} ref={bellRef}>
      <button
        className={`${styles.bellBtn} ${hasAdminAlert ? styles.bellBtnAlert : ''}`}
        onClick={handleToggle}
        aria-label={hasAdminAlert ? 'Notifications - Admin Alert Pending' : 'Notifications'}
      >
        <FaBell style={hasAdminAlert ? { color: '#f59e0b' } : undefined} />
        {count > 0 && (
          <span className={`${styles.badge} ${hasAdminAlert ? styles.badgeAlert : ''}`}>
            {displayCount}
          </span>
        )}
      </button>

      {isOpen && <NotificationDropdown onClose={() => setIsOpen(false)} />}
    </div>
  )
}

export default NotificationBell
