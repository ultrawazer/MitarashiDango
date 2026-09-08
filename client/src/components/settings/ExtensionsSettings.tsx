import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  FaPuzzlePiece,
  FaSync,
  FaDownload,
  FaTrash,
  FaExternalLinkAlt,
  FaCheck,
  FaLayerGroup,
  FaPlus,
  FaTimes,
  FaGlobe,
} from 'react-icons/fa'
import toast from 'react-hot-toast'
import ToggleSwitch from '../common/ToggleSwitch'
import styles from './ExtensionsSettings.module.css'

interface ExtensionMetadata {
  id: string
  name: string
  version: string
  type: 'anime' | 'tv' | 'asmr'
  description?: string
  author?: string
  icon?: string
  isMature?: boolean
  website?: string
}

interface InstalledExtension {
  metadata: ExtensionMetadata
  enabled: boolean
  isBuiltin?: boolean
  hasUpdate?: boolean
}

interface AvailableExtension {
  id: string
  name: string
  version: string
  type: 'anime' | 'tv' | 'asmr'
  description?: string
  author?: string
  icon?: string
  isMature?: boolean
  installed: boolean
  currentVersion?: string
  hasUpdate?: boolean
  isBuiltin?: boolean
  repoId?: string
  repoName?: string
  downloadUrl?: string
}

interface ExtensionRepository {
  id: string
  name: string
  url: string
  enabled: boolean
  isDefault?: boolean
}

const ExtensionsSettings: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'installed' | 'available'>('installed')
  const [installed, setInstalled] = useState<InstalledExtension[]>([])
  const [available, setAvailable] = useState<AvailableExtension[]>([])
  const [repos, setRepos] = useState<ExtensionRepository[]>([])
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [repoFilter, setRepoFilter] = useState<string>('all')

  // Repositories modal state
  const [isRepoModalOpen, setIsRepoModalOpen] = useState(false)
  const [newRepoUrl, setNewRepoUrl] = useState('')
  const [newRepoName, setNewRepoName] = useState('')
  const [addingRepo, setAddingRepo] = useState(false)

  const fetchInstalled = useCallback(async () => {
    try {
      const res = await fetch('/api/extensions')
      if (!res.ok) throw new Error('Failed to fetch installed extensions')
      const data = await res.json()
      setInstalled(data)
    } catch (err) {
      console.error(err)
    }
  }, [])

  const fetchAvailable = useCallback(async () => {
    try {
      const res = await fetch('/api/extensions/available')
      if (!res.ok) throw new Error('Failed to fetch repository extensions')
      const data = await res.json()
      setAvailable(data)
    } catch (err) {
      console.error(err)
    }
  }, [])

  const fetchRepos = useCallback(async () => {
    try {
      const res = await fetch('/api/extensions/repos')
      if (!res.ok) throw new Error('Failed to fetch repositories')
      const data = await res.json()
      setRepos(data)
    } catch (err) {
      console.error(err)
    }
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    await Promise.all([fetchInstalled(), fetchAvailable(), fetchRepos()])
    setLoading(false)
  }, [fetchInstalled, fetchAvailable, fetchRepos])

  useEffect(() => {
    loadData()
  }, [loadData])

  const setBusy = (id: string, busy: boolean) => {
    setActionLoading((prev) => ({ ...prev, [id]: busy }))
  }

  const handleToggle = async (ext: InstalledExtension) => {
    if (ext.isBuiltin) return
    const newEnabled = !ext.enabled
    setBusy(ext.metadata.id, true)
    try {
      const res = await fetch(`/api/extensions/toggle/${ext.metadata.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newEnabled }),
      })
      if (!res.ok) throw new Error('Failed to toggle extension')
      toast.success(`${ext.metadata.name} ${newEnabled ? 'enabled' : 'disabled'}`)
      await fetchInstalled()
    } catch (err) {
      toast.error((err as Error).message || 'Failed to toggle')
    } finally {
      setBusy(ext.metadata.id, false)
    }
  }

  const handleInstall = async (id: string, name: string, downloadUrl?: string) => {
    setBusy(id, true)
    const toastId = toast.loading(`Installing ${name}...`)
    try {
      const res = await fetch(`/api/extensions/install/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ downloadUrl }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Installation failed')
      }
      toast.success(`${name} installed successfully!`, { id: toastId })
      await Promise.all([fetchInstalled(), fetchAvailable()])
    } catch (err) {
      toast.error((err as Error).message || 'Installation failed', { id: toastId })
    } finally {
      setBusy(id, false)
    }
  }

  const handleUninstall = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to uninstall "${name}"?`)) return
    setBusy(id, true)
    const toastId = toast.loading(`Uninstalling ${name}...`)
    try {
      const res = await fetch(`/api/extensions/uninstall/${id}`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to uninstall')
      }
      toast.success(`${name} uninstalled`, { id: toastId })
      await Promise.all([fetchInstalled(), fetchAvailable()])
    } catch (err) {
      toast.error((err as Error).message || 'Uninstall failed', { id: toastId })
    } finally {
      setBusy(id, false)
    }
  }

  const handleReload = async () => {
    setLoading(true)
    const toastId = toast.loading('Reloading extensions & repositories...')
    try {
      const res = await fetch('/api/extensions/reload', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Reload failed')
      toast.success(`Reloaded ${data.count} extensions`, { id: toastId })
      await Promise.all([fetchInstalled(), fetchAvailable(), fetchRepos()])
    } catch (err) {
      toast.error((err as Error).message || 'Reload failed', { id: toastId })
    } finally {
      setLoading(false)
    }
  }

  const handleAddRepo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRepoUrl.trim()) {
      toast.error('Please enter a repository URL')
      return
    }

    setAddingRepo(true)
    const toastId = toast.loading('Connecting to repository...')
    try {
      const res = await fetch('/api/extensions/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newRepoUrl.trim(), name: newRepoName.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to add repository')
      }

      toast.success(`Repository "${data.repo.name}" added!`, { id: toastId })
      setNewRepoUrl('')
      setNewRepoName('')
      await Promise.all([fetchRepos(), fetchAvailable()])
    } catch (err) {
      toast.error((err as Error).message || 'Failed to add repository', { id: toastId })
    } finally {
      setAddingRepo(false)
    }
  }

  const handleRemoveRepo = async (repo: ExtensionRepository) => {
    if (!window.confirm(`Are you sure you want to remove "${repo.name}"?`)) return

    try {
      const res = await fetch(`/api/extensions/repos/${repo.id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to remove repository')
      }
      toast.success(`Removed repository "${repo.name}"`)
      await Promise.all([fetchRepos(), fetchAvailable()])
    } catch (err) {
      toast.error((err as Error).message || 'Failed to remove repository')
    }
  }

  const handleToggleRepo = async (repo: ExtensionRepository) => {
    try {
      const res = await fetch(`/api/extensions/repos/toggle/${repo.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !repo.enabled }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error('Toggle failed')
      toast.success(`${repo.name} ${data.enabled ? 'enabled' : 'disabled'}`)
      await Promise.all([fetchRepos(), fetchAvailable()])
    } catch (err) {
      toast.error((err as Error).message || 'Failed to toggle repository')
    }
  }

  const filteredInstalled = useMemo(() => {
    return installed.filter((item) => {
      const meta = item.metadata
      const matchesSearch =
        meta.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        meta.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (meta.description && meta.description.toLowerCase().includes(searchQuery.toLowerCase()))

      if (!matchesSearch) return false

      if (filterType === 'all') return true
      if (filterType === 'mature') return meta.isMature === true
      return meta.type === filterType
    })
  }, [installed, searchQuery, filterType])

  const filteredAvailable = useMemo(() => {
    return available.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()))

      if (!matchesSearch) return false

      if (repoFilter !== 'all' && item.repoId !== repoFilter) return false

      if (filterType === 'all') return true
      if (filterType === 'mature') return item.isMature === true
      return item.type === filterType
    })
  }, [available, searchQuery, filterType, repoFilter])

  const renderTypeBadge = (type: string) => {
    switch (type) {
      case 'anime':
        return <span className={`${styles.badge} ${styles.badgeAnime}`}>Anime</span>
      case 'tv':
        return <span className={`${styles.badge} ${styles.badgeTv}`}>TV & Movies</span>
      case 'asmr':
        return <span className={`${styles.badge} ${styles.badgeAsmr}`}>ASMR</span>
      default:
        return <span className={styles.badge}>{type}</span>
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.headerCard}>
        <div className={styles.headerTitleRow}>
          <div>
            <h3 className={styles.headerTitle}>
              <FaPuzzlePiece /> Extensions Ecosystem
            </h3>
            <p className={styles.headerDesc}>
              Modular scrapers and source providers inspired by Mihon. Add, update, or remove
              extensions without modifying the core player.
            </p>
          </div>
          <div className={styles.buttonBar}>
            <button
              className={`${styles.actionBtn} ${styles.btnSecondary}`}
              onClick={() => setIsRepoModalOpen(true)}
              title="Manage extension repositories"
            >
              <FaLayerGroup /> Repositories ({repos.length})
            </button>
            <button
              className={`${styles.actionBtn} ${styles.btnSecondary}`}
              onClick={handleReload}
              disabled={loading}
              title="Reload extensions from disk & repositories"
            >
              <FaSync className={loading ? 'fa-spin' : ''} /> Reload
            </button>
          </div>
        </div>

        <div className={styles.tabControls}>
          <button
            className={`${styles.tabButton} ${activeSubTab === 'installed' ? styles.active : ''}`}
            onClick={() => setActiveSubTab('installed')}
          >
            Installed ({installed.length})
          </button>
          <button
            className={`${styles.tabButton} ${activeSubTab === 'available' ? styles.active : ''}`}
            onClick={() => setActiveSubTab('available')}
          >
            Browse Repository ({available.length})
          </button>
        </div>

        <div className={styles.searchAndFilter}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search extensions by name or provider..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select
            className={styles.filterSelect}
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">All Types</option>
            <option value="anime">Anime</option>
            <option value="tv">TV & Movies</option>
            <option value="asmr">ASMR</option>
            <option value="mature">Mature (18+)</option>
          </select>
          {activeSubTab === 'available' && repos.length > 1 && (
            <select
              className={styles.filterSelect}
              value={repoFilter}
              onChange={(e) => setRepoFilter(e.target.value)}
            >
              <option value="all">All Repositories</option>
              {repos.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {activeSubTab === 'installed' ? (
        <div className={styles.grid}>
          {filteredInstalled.length === 0 ? (
            <div className={styles.emptyMsg}>
              No installed extensions match your search or filter.
            </div>
          ) : (
            filteredInstalled.map((ext) => {
              const meta = ext.metadata
              const isBusy = actionLoading[meta.id]
              return (
                <div key={meta.id} className={styles.card}>
                  <div className={styles.cardTop}>
                    <div className={styles.extInfo}>
                      <div className={styles.extName}>
                        {meta.name}
                        <span className={styles.extVersion}>v{meta.version}</span>
                      </div>
                      <div className={styles.badgeRow}>
                        {renderTypeBadge(meta.type)}
                        {meta.isMature && (
                          <span className={`${styles.badge} ${styles.badgeMature}`}>18+</span>
                        )}
                        {ext.isBuiltin && (
                          <span className={`${styles.badge} ${styles.badgeBuiltin}`}>Built-in</span>
                        )}
                        {ext.hasUpdate && (
                          <span
                            className={`${styles.badge}`}
                            style={{
                              background: 'rgba(234, 179, 8, 0.15)',
                              color: '#eab308',
                              border: '1px solid rgba(234, 179, 8, 0.3)',
                            }}
                          >
                            Update Available
                          </span>
                        )}
                      </div>
                    </div>
                    {ext.isBuiltin ? (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-secondary)',
                          fontStyle: 'italic',
                        }}
                      >
                        Core
                      </span>
                    ) : (
                      <ToggleSwitch
                        isChecked={ext.enabled}
                        onChange={() => handleToggle(ext)}
                        id={`toggle-ext-${meta.id}`}
                        disabled={isBusy}
                      />
                    )}
                  </div>

                  <p className={styles.extDesc}>
                    {meta.description || 'No description available for this provider.'}
                  </p>

                  <div className={styles.cardBottom}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {meta.author && <span>by {meta.author}</span>}
                      {meta.website && (
                        <a
                          href={meta.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: 'var(--accent, #6366f1)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.2rem',
                          }}
                        >
                          site <FaExternalLinkAlt size={10} />
                        </a>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {ext.hasUpdate && (
                        <button
                          className={`${styles.actionBtn} ${styles.btnPrimary}`}
                          onClick={() => handleInstall(meta.id, meta.name)}
                          disabled={isBusy}
                          title="Update extension to the latest version"
                        >
                          <FaSync className={isBusy ? 'fa-spin' : ''} /> Update
                        </button>
                      )}
                      {!ext.isBuiltin && (
                        <button
                          className={`${styles.actionBtn} ${styles.btnDanger}`}
                          onClick={() => handleUninstall(meta.id, meta.name)}
                          disabled={isBusy}
                          title="Uninstall extension"
                        >
                          <FaTrash />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      ) : (
        <div className={styles.grid}>
          {filteredAvailable.length === 0 ? (
            <div className={styles.emptyMsg}>
              No extensions found in the repository matching your search.
            </div>
          ) : (
            filteredAvailable.map((ext) => {
              const isBusy = actionLoading[ext.id]
              return (
                <div key={ext.id} className={styles.card}>
                  <div className={styles.cardTop}>
                    <div className={styles.extInfo}>
                      <div className={styles.extName}>
                        {ext.name}
                        <span className={styles.extVersion}>v{ext.version}</span>
                      </div>
                      <div className={styles.badgeRow}>
                        {renderTypeBadge(ext.type)}
                        {ext.isMature && (
                          <span className={`${styles.badge} ${styles.badgeMature}`}>18+</span>
                        )}
                        {ext.isBuiltin && (
                          <span className={`${styles.badge} ${styles.badgeBuiltin}`}>Built-in</span>
                        )}
                        {ext.repoName && (
                          <span className={`${styles.badge} ${styles.badgeRepo}`}>
                            {ext.repoName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <p className={styles.extDesc}>
                    {ext.description || 'Extension provider package.'}
                  </p>

                  <div className={styles.cardBottom}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {ext.author && <span>by {ext.author}</span>}
                    </div>

                    {ext.isBuiltin ? (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-secondary)',
                          fontStyle: 'italic',
                        }}
                      >
                        Core Built-in
                      </span>
                    ) : ext.installed ? (
                      ext.hasUpdate ? (
                        <button
                          className={`${styles.actionBtn} ${styles.btnPrimary}`}
                          onClick={() => handleInstall(ext.id, ext.name, ext.downloadUrl)}
                          disabled={isBusy}
                        >
                          <FaSync className={isBusy ? 'fa-spin' : ''} /> Update
                        </button>
                      ) : (
                        <span
                          className={`${styles.actionBtn} ${styles.btnSecondary}`}
                          style={{ cursor: 'default', color: '#10b981' }}
                        >
                          <FaCheck /> Installed
                        </span>
                      )
                    ) : (
                      <button
                        className={`${styles.actionBtn} ${styles.btnPrimary}`}
                        onClick={() => handleInstall(ext.id, ext.name, ext.downloadUrl)}
                        disabled={isBusy}
                      >
                        <FaDownload /> Install
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Repositories Modal */}
      {isRepoModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsRepoModalOpen(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h4 className={styles.modalTitle}>
                <FaLayerGroup /> Extension Repositories
              </h4>
              <button
                className={styles.modalClose}
                onClick={() => setIsRepoModalOpen(false)}
                title="Close"
              >
                <FaTimes />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.repoList}>
                {repos.map((repo) => (
                  <div key={repo.id} className={styles.repoItem}>
                    <div className={styles.repoItemInfo}>
                      <div className={styles.repoItemName}>
                        <FaGlobe size={14} color="var(--accent, #6366f1)" />
                        {repo.name}
                        {repo.isDefault && (
                          <span
                            className={styles.badge}
                            style={{
                              background: 'rgba(99, 102, 241, 0.2)',
                              color: '#818cf8',
                              fontSize: '0.65rem',
                            }}
                          >
                            Default
                          </span>
                        )}
                      </div>
                      <div className={styles.repoItemUrl} title={repo.url}>
                        {repo.url}
                      </div>
                    </div>
                    <div className={styles.repoItemActions}>
                      <ToggleSwitch
                        isChecked={repo.enabled}
                        onChange={() => handleToggleRepo(repo)}
                        id={`toggle-repo-${repo.id}`}
                      />
                      <button
                        className={`${styles.actionBtn} ${styles.btnDanger}`}
                        onClick={() => handleRemoveRepo(repo)}
                        title="Remove repository"
                        style={{ padding: '0.35rem 0.6rem' }}
                      >
                        <FaTrash size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {!repos.some((r) => r.id === 'official' || r.isDefault) && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.btnSecondary}`}
                    onClick={() => {
                      setNewRepoUrl('https://github.com/ultrawazer/MitarashiDango_Extensions')
                      setNewRepoName('Official Dango Extensions')
                    }}
                  >
                    <FaPlus size={10} /> Restore Official Repository
                  </button>
                </div>
              )}

              {/* Add Repository Card */}
              <form className={styles.addRepoCard} onSubmit={handleAddRepo}>
                <h5 className={styles.addRepoTitle}>Add Custom Repository</h5>
                <div className={styles.addRepoInputs}>
                  <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="Repository URL (e.g. https://github.com/owner/repo or raw index.min.json)"
                    value={newRepoUrl}
                    onChange={(e) => setNewRepoUrl(e.target.value)}
                    required
                  />
                  <div className={styles.addRepoRow}>
                    <input
                      type="text"
                      className={styles.searchInput}
                      placeholder="Display Name (optional)"
                      value={newRepoName}
                      onChange={(e) => setNewRepoName(e.target.value)}
                    />
                    <button
                      type="submit"
                      className={`${styles.actionBtn} ${styles.btnPrimary}`}
                      disabled={addingRepo}
                    >
                      <FaPlus /> {addingRepo ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ExtensionsSettings
