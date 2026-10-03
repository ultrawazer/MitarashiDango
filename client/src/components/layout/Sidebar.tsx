import React from 'react'
import { Link, NavLink } from 'react-router'
import { useSidebar } from '../../hooks/useSidebar'
import { useAuth } from '../../contexts/AuthContext'
import styles from './Sidebar.module.css'
import {
  FaHome,
  FaSearch,
  FaClock,
  FaSyncAlt,
  FaCog,
  FaChartPie,
  FaHeadphones,
  FaTv,
  FaBroadcastTower,
  FaCompass,
  FaExclamationTriangle,
} from 'react-icons/fa'
import { useSystemNotifications } from '../../hooks/useAnimeData'
import Logo from '../common/Logo'
import packageJson from '../../../package.json'

const Sidebar: React.FC = () => {
  const { isOpen, setIsOpen } = useSidebar()
  const { isAdmin } = useAuth()
  const { data: systemNotifications = [] } = useSystemNotifications(isAdmin)
  const hasFlaggedAlerts = isAdmin && systemNotifications.some((sn) => sn.type === 'admin-alert')

  const handleNavLinkClick = () => {
    setIsOpen(false)
  }

  const navItems = [
    { to: '/', icon: <FaHome />, label: 'Home' },
    { to: '/search', icon: <FaSearch />, label: 'Search' },
    { to: '/recommendations', icon: <FaCompass />, label: 'Recommendations' },
    { to: '/watchlist', icon: <FaClock />, label: 'Watchlist' },
    { to: '/insights', icon: <FaChartPie />, label: 'Insights' },
    { to: '/trackers', icon: <FaSyncAlt />, label: 'Trackers' },
    { to: '/asmr', icon: <FaHeadphones />, label: 'ASMR' },
    { to: '/radio', icon: <FaBroadcastTower />, label: 'Radio' },
    { to: '/tv', icon: <FaTv />, label: 'TV & Movies' },
    ...(isAdmin
      ? [
          {
            to: hasFlaggedAlerts ? '/settings?tab=users' : '/settings',
            icon: <FaCog />,
            label: 'Settings',
            badge: hasFlaggedAlerts ? (
              <span className={styles.navAlertBadge} title="Account security alert pending">
                <FaExclamationTriangle size={10} />
              </span>
            ) : null,
          },
        ]
      : []),
  ]

  return (
    <>
      <aside className={`${styles.sidebar} ${isOpen ? styles.open : ''} sidebar`}>
        <div className={styles.sidebarHeader}>
          <button
            className={styles.closeBtn}
            onClick={() => setIsOpen(false)}
            aria-label="Close menu"
          >
            &times;
          </button>
          <Link to="/" className={styles.logo} onClick={handleNavLinkClick}>
            <Logo />
          </Link>
        </div>

        <nav className={styles.navSection}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
              onClick={handleNavLinkClick}
              end={item.to === '/'}
            >
              {item.icon}
              <span>{item.label}</span>
              {'badge' in item && item.badge}
            </NavLink>
          ))}
        </nav>

        <div className={styles.versionInfo}>v{packageJson.version}</div>
      </aside>
      {isOpen && (
        <div
          className={styles.overlay}
          onClick={() => setIsOpen(false)}
          aria-label="Close sidebar"
        />
      )}
    </>
  )
}

export default Sidebar
