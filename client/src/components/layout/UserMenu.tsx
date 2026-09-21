import React, { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router'
import { FaUserCog, FaShieldAlt, FaSignOutAlt, FaUser } from 'react-icons/fa'
import { useAuth } from '../../contexts/AuthContext'
import styles from './UserMenu.module.css'

export const UserMenu: React.FC = () => {
  const { user, isAdmin, logout } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (!user) return null

  const initial = (user.displayName || user.username || 'U').charAt(0).toUpperCase()

  const handleLogout = async () => {
    setIsOpen(false)
    await logout()
    navigate('/login')
  }

  const handleLinkClick = () => {
    setIsOpen(false)
  }

  return (
    <div className={styles.container} ref={menuRef}>
      <button
        type="button"
        className={styles.avatarButton}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="User profile menu"
        aria-expanded={isOpen}
        id="user-profile-menu-button"
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt={user.displayName} className={styles.avatarImg} />
        ) : (
          <FaUser className={styles.userIcon} />
        )}
      </button>

      {isOpen && (
        <div className={styles.dropdown} id="user-profile-dropdown">
          <div className={styles.userHeader}>
            <div className={styles.headerAvatar}>
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.displayName} />
              ) : (
                <div className={styles.avatarPlaceholder}>{initial}</div>
              )}
            </div>
            <div className={styles.headerUserInfo}>
              <div className={styles.headerDisplayName}>{user.displayName}</div>
              <div className={styles.headerUsername}>@{user.username}</div>
              <span className={`${styles.roleBadge} ${isAdmin ? styles.roleAdmin : styles.roleUser}`}>
                {isAdmin ? 'Admin' : 'User'}
              </span>
            </div>
          </div>

          <div className={styles.divider} />

          <Link
            to="/user-settings"
            className={styles.menuItem}
            onClick={handleLinkClick}
            id="menu-user-settings-link"
          >
            <span className={styles.menuItemIcon}>
              <FaUserCog />
            </span>
            <span>User Settings</span>
          </Link>

          {isAdmin && (
            <Link
              to="/settings"
              className={styles.menuItem}
              onClick={handleLinkClick}
              id="menu-admin-settings-link"
            >
              <span className={styles.menuItemIcon}>
                <FaShieldAlt />
              </span>
              <span>Admin Settings</span>
            </Link>
          )}

          <div className={styles.divider} />

          <button
            type="button"
            className={`${styles.menuItem} ${styles.logoutBtn}`}
            onClick={handleLogout}
            id="menu-logout-button"
          >
            <span className={styles.menuItemIcon}>
              <FaSignOutAlt />
            </span>
            <span>Log Out</span>
          </button>
        </div>
      )}
    </div>
  )
}

export default UserMenu
