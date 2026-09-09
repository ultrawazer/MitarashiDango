import path from 'path'
import fs from 'fs'
import logger from '../logger'
import {
  AnimeExtension,
  TvExtension,
  AsmrExtension,
  IExtension,
  InstalledExtensionRecord,
  ExtensionMetadata,
  ExtensionRepository,
} from './extension.types'
import { shokoProvider } from '../providers/shoko.provider'

const log = logger.child({ module: 'ExtensionManager' })

// Repository configuration
const LOCAL_DEV_EXTENSIONS_DIR =
  process.env.LOCAL_DEV_EXTENSIONS_DIR || 'G:/antigravity/MitarashiDango_Extensions/dist'
const REMOTE_REPO_INDEX_URL =
  process.env.EXTENSIONS_REPO_URL ||
  'https://raw.githubusercontent.com/ultrawazer/MitarashiDango_Extensions/main/dist/index.min.json'
const REMOTE_REPO_RAW_BASE =
  process.env.EXTENSIONS_RAW_BASE ||
  'https://raw.githubusercontent.com/ultrawazer/MitarashiDango_Extensions/main/dist/'

const DEFAULT_OFFICIAL_REPO: ExtensionRepository = {
  id: 'official',
  name: 'Official Dango Extensions',
  url: REMOTE_REPO_INDEX_URL,
  enabled: true,
  isDefault: true,
}

export class ExtensionManager {
  private extensionsDir: string
  private installedJsonPath: string
  private repositoriesJsonPath: string
  private installedRecords = new Map<string, InstalledExtensionRecord>()
  private repositories = new Map<string, ExtensionRepository>()

  private animeExtensions = new Map<string, AnimeExtension>()
  private tvExtensions = new Map<string, TvExtension>()
  private asmrExtensions = new Map<string, AsmrExtension>()

  constructor(baseDir?: string) {
    const root = baseDir || path.resolve(__dirname, '..', '..')
    this.extensionsDir = path.join(root, 'data', 'extensions')
    this.installedJsonPath = path.join(this.extensionsDir, 'installed.json')
    this.repositoriesJsonPath = path.join(this.extensionsDir, 'repositories.json')
  }

  public async init(): Promise<void> {
    if (!fs.existsSync(this.extensionsDir)) {
      fs.mkdirSync(this.extensionsDir, { recursive: true })
    }

    // 1. Always register built-in Shoko provider
    this.registerBuiltin(shokoProvider)

    // 2. Load installed records registry & repositories
    this.loadRegistry()
    this.loadRepositories()

    // 3. Load all installed extension files from disk
    this.loadAllFromDisk()

    log.info(
      {
        animeCount: this.animeExtensions.size,
        tvCount: this.tvExtensions.size,
        asmrCount: this.asmrExtensions.size,
      },
      'ExtensionManager initialized successfully'
    )
  }

  private registerBuiltin(provider: AnimeExtension): void {
    const meta = provider.metadata || {
      id: 'shoko',
      name: 'Shoko (Local)',
      version: '1.0.0',
      type: 'anime',
      lang: 'all',
      mature: false,
      description: 'Local anime library managed by Shoko Server',
    }

    this.animeExtensions.set(meta.id, provider)
    this.installedRecords.set(meta.id, {
      id: meta.id,
      metadata: meta,
      enabled: true,
      isBuiltin: true,
      pkg: 'builtin',
      installedAt: new Date().toISOString(),
    })
  }

  private loadRegistry(): void {
    if (fs.existsSync(this.installedJsonPath)) {
      try {
        const raw = fs.readFileSync(this.installedJsonPath, 'utf8')
        const data = JSON.parse(raw) as InstalledExtensionRecord[]
        for (const item of data) {
          if (item.id !== 'shoko') {
            this.installedRecords.set(item.id, item)
          }
        }
      } catch (err) {
        log.error({ err }, 'Failed to parse installed.json')
      }
    }
  }

  private saveRegistry(): void {
    try {
      const list = Array.from(this.installedRecords.values()).filter((r) => !r.isBuiltin)
      fs.writeFileSync(this.installedJsonPath, JSON.stringify(list, null, 2), 'utf8')
    } catch (err) {
      log.error({ err }, 'Failed to save installed.json')
    }
  }



  private loadAllFromDisk(): void {
    try {
      const files = fs.readdirSync(this.extensionsDir).filter((f) => f.endsWith('.js'))
      for (const file of files) {
        const extId = path.basename(file, '.js')
        const filePath = path.join(this.extensionsDir, file)
        this.loadExtensionModule(filePath, extId)
      }
    } catch (err) {
      log.error({ err }, 'Failed to read extensions directory')
    }
  }

  private loadExtensionModule(filePath: string, extId: string): boolean {
    try {
      delete require.cache[require.resolve(filePath)]
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(filePath)
      const instance = (mod.default || mod) as IExtension

      const metadata: ExtensionMetadata = instance.metadata || mod.metadata
      if (!metadata || !metadata.id) {
        log.warn({ filePath }, 'Extension file missing metadata, skipping')
        return false
      }

      const isEnabled = this.installedRecords.get(metadata.id)?.enabled ?? true

      // Update registry record
      this.installedRecords.set(metadata.id, {
        id: metadata.id,
        metadata,
        enabled: isEnabled,
        isBuiltin: false,
        pkg: path.basename(filePath),
        installedAt:
          this.installedRecords.get(metadata.id)?.installedAt || new Date().toISOString(),
      })
      this.saveRegistry()

      if (!isEnabled) {
        return true
      }

      switch (metadata.type) {
        case 'anime':
          this.animeExtensions.set(metadata.id, instance as AnimeExtension)
          break
        case 'tv':
          this.tvExtensions.set(metadata.id, instance as TvExtension)
          break
        case 'asmr':
          this.asmrExtensions.set(metadata.id, instance as AsmrExtension)
          break
      }

      log.debug({ id: metadata.id, name: metadata.name, type: metadata.type }, 'Loaded extension')
      return true
    } catch (err) {
      log.error({ err, filePath, extId }, 'Failed to load extension module')
      return false
    }
  }

  // --- Public Provider Retrieval ---

  public getAnimeProvider(id: string): AnimeExtension | null {
    return this.animeExtensions.get(id.toLowerCase()) || null
  }

  public getTvProvider(id: string): TvExtension | null {
    return this.tvExtensions.get(id.toLowerCase()) || null
  }

  public getAsmrProvider(id?: string): AsmrExtension | null {
    if (id) return this.asmrExtensions.get(id.toLowerCase()) || null
    return this.asmrExtensions.values().next().value || null
  }

  public getActiveAnimeProviders(): { [id: string]: AnimeExtension } {
    const out: { [id: string]: AnimeExtension } = {}
    for (const [id, ext] of this.animeExtensions.entries()) {
      out[id] = ext
    }
    return out
  }

  public getActiveTvProviders(): { [id: string]: TvExtension } {
    const out: { [id: string]: TvExtension } = {}
    for (const [id, ext] of this.tvExtensions.entries()) {
      out[id] = ext
    }
    return out
  }

  public getActiveAsmrProviders(): { [id: string]: AsmrExtension } {
    const out: { [id: string]: AsmrExtension } = {}
    for (const [id, ext] of this.asmrExtensions.entries()) {
      out[id] = ext
    }
    return out
  }

  // --- Repository Management APIs ---

  private loadRepositories(): void {
    if (fs.existsSync(this.repositoriesJsonPath)) {
      try {
        const raw = fs.readFileSync(this.repositoriesJsonPath, 'utf8')
        const list = JSON.parse(raw) as ExtensionRepository[]
        this.repositories.clear()
        for (const repo of list) {
          this.repositories.set(repo.id, repo)
        }
      } catch (err) {
        log.error({ err }, 'Failed to parse repositories.json')
      }
    } else {
      // First boot default
      this.repositories.set(DEFAULT_OFFICIAL_REPO.id, { ...DEFAULT_OFFICIAL_REPO })
      this.saveRepositories()
    }
  }

  private saveRepositories(): void {
    try {
      const list = Array.from(this.repositories.values())
      fs.writeFileSync(this.repositoriesJsonPath, JSON.stringify(list, null, 2), 'utf8')
    } catch (err) {
      log.error({ err }, 'Failed to save repositories.json')
    }
  }

  public getRepositories(): ExtensionRepository[] {
    return Array.from(this.repositories.values())
  }

  public async addRepository(
    urlInput: string,
    customName?: string
  ): Promise<{ success: boolean; repo?: ExtensionRepository; error?: string }> {
    let cleanUrl = (urlInput || '').trim()
    if (!cleanUrl) return { success: false, error: 'Repository URL is required' }

    // Normalize GitHub repository URLs
    if (cleanUrl.startsWith('https://github.com/')) {
      const parts = cleanUrl.replace('https://github.com/', '').split('/')
      if (parts.length >= 2) {
        const owner = parts[0]
        const repo = parts[1]
        cleanUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/dist/index.min.json`
      }
    } else if (cleanUrl.includes('raw.githubusercontent.com/')) {
      const withoutQuery = cleanUrl.split('?')[0].replace(/\/+$/, '')
      if (!withoutQuery.endsWith('.json')) {
        if (withoutQuery.endsWith('/dist')) {
          cleanUrl = `${withoutQuery}/index.min.json`
        } else {
          cleanUrl = `${withoutQuery}/dist/index.min.json`
        }
      }
    } else if (!cleanUrl.split('?')[0].endsWith('.json')) {
      cleanUrl = cleanUrl.replace(/\/+$/, '') + '/index.min.json'
    }

    const isOfficial =
      cleanUrl.toLowerCase() === DEFAULT_OFFICIAL_REPO.url.toLowerCase() ||
      cleanUrl.toLowerCase().includes('mitarashidango_extensions')

    // Prevent duplicate URLs or re-enable if already added
    for (const existing of this.repositories.values()) {
      if (existing.url.toLowerCase() === cleanUrl.toLowerCase() || (isOfficial && existing.isDefault)) {
        if (!existing.enabled) {
          existing.enabled = true
          this.saveRepositories()
          return { success: true, repo: existing }
        }
        return { success: false, error: 'Repository is already added and enabled' }
      }
    }

    // Verify manifest accessibility
    try {
      const res = await fetch(cleanUrl, { signal: AbortSignal.timeout(10000) })
      if (!res.ok) {
        return {
          success: false,
          error: `Repository returned HTTP ${res.status}. Ensure the repository is Public.`,
        }
      }
      const data = await res.json()
      if (!Array.isArray(data)) {
        return { success: false, error: 'Invalid repository manifest (must contain an array of extensions)' }
      }

      const id = isOfficial ? 'official' : 'repo_' + Math.random().toString(36).substring(2, 9)
      let name = customName?.trim()
      if (!name) {
        if (isOfficial) {
          name = DEFAULT_OFFICIAL_REPO.name
        } else {
          const match = cleanUrl.match(/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)/)
          if (match) {
            name = `${match[1]}/${match[2]}`
          } else {
            name = `Repository ${this.repositories.size + 1}`
          }
        }
      }

      const newRepo: ExtensionRepository = {
        id,
        name,
        url: cleanUrl,
        enabled: true,
        isDefault: isOfficial,
      }

      this.repositories.set(id, newRepo)
      this.saveRepositories()
      return { success: true, repo: newRepo }
    } catch (err) {
      return { success: false, error: `Failed to reach repository: ${(err as Error).message}` }
    }
  }

  public restoreDefaultRepository(): { success: boolean; repo: ExtensionRepository } {
    const repo: ExtensionRepository = {
      ...DEFAULT_OFFICIAL_REPO,
      enabled: true,
    }
    this.repositories.set(DEFAULT_OFFICIAL_REPO.id, repo)
    this.saveRepositories()
    return { success: true, repo }
  }

  public removeRepository(id: string): { success: boolean; error?: string } {
    const repo = this.repositories.get(id)
    if (!repo) return { success: false, error: 'Repository not found' }

    this.repositories.delete(id)
    this.saveRepositories()
    return { success: true }
  }

  public toggleRepository(id: string, enabled?: boolean): { success: boolean; enabled: boolean; error?: string } {
    const repo = this.repositories.get(id)
    if (!repo) return { success: false, enabled: false, error: 'Repository not found' }

    const nextState = enabled !== undefined ? enabled : !repo.enabled
    repo.enabled = nextState
    this.saveRepositories()
    return { success: true, enabled: nextState }
  }

  // --- Extension Management APIs ---

  public getInstalled(): InstalledExtensionRecord[] {
    return Array.from(this.installedRecords.values())
  }

  public async getInstalledWithUpdates(): Promise<
    (InstalledExtensionRecord & {
      hasUpdate?: boolean
      latestVersion?: string
      downloadUrl?: string
    })[]
  > {
    const installedList = Array.from(this.installedRecords.values())
    try {
      const available = await this.getAvailable()
      const availMap = new Map(available.map((a) => [a.id, a]))
      return installedList.map((inst) => {
        const avail = availMap.get(inst.id)
        const hasUpdate = !!avail && avail.version !== inst.metadata.version
        return {
          ...inst,
          hasUpdate,
          latestVersion: avail?.version,
          downloadUrl: avail?.downloadUrl,
        }
      })
    } catch {
      return installedList
    }
  }

  public async checkUpdates(): Promise<
    {
      id: string
      name: string
      currentVersion: string
      latestVersion: string
      downloadUrl?: string
    }[]
  > {
    try {
      const available = await this.getAvailable()
      const updates: {
        id: string
        name: string
        currentVersion: string
        latestVersion: string
        downloadUrl?: string
      }[] = []
      for (const item of available) {
        if (item.installed && item.hasUpdate && item.currentVersion) {
          updates.push({
            id: item.id,
            name: item.name,
            currentVersion: item.currentVersion,
            latestVersion: item.version,
            downloadUrl: item.downloadUrl,
          })
        }
      }
      return updates
    } catch (err) {
      log.warn({ err }, 'Failed to check extension updates')
      return []
    }
  }

  public async getAvailable(): Promise<
    (ExtensionMetadata & {
      pkg: string
      installed: boolean
      isInstalled: boolean
      currentVersion?: string
      installedVersion?: string
      hasUpdate?: boolean
      isBuiltin?: boolean
      repoId?: string
      repoName?: string
      downloadUrl?: string
    })[]
  > {
    const availableMap = new Map<string, any>()

    // 1. Local dev repo index (priority in local development)
    // ONLY inject if the official/default repository exists AND is enabled
    const officialRepo =
      this.repositories.get('official') ||
      Array.from(this.repositories.values()).find((r) => r.isDefault)
    const isOfficialEnabled = officialRepo ? officialRepo.enabled : false

    if (isOfficialEnabled && fs.existsSync(LOCAL_DEV_EXTENSIONS_DIR)) {
      const localIndex = path.join(LOCAL_DEV_EXTENSIONS_DIR, 'index.min.json')
      if (fs.existsSync(localIndex)) {
        try {
          const raw = fs.readFileSync(localIndex, 'utf8')
          const items = JSON.parse(raw)
          if (Array.isArray(items)) {
            for (const item of items) {
              availableMap.set(item.id, {
                ...item,
                repoId: officialRepo ? officialRepo.id : 'official',
                repoName: officialRepo ? officialRepo.name : 'Official Dango Extensions',
                downloadUrl: path.join(LOCAL_DEV_EXTENSIONS_DIR, `${item.id}.js`),
              })
            }
          }
        } catch (err) {
          log.warn({ err }, 'Failed to read local dev index.min.json')
        }
      }
    }

    // 2. Enabled repositories in parallel
    const enabledRepos = Array.from(this.repositories.values()).filter((r) => r.enabled)
    await Promise.all(
      enabledRepos.map(async (repo) => {
        // If we already loaded local dev items for this repo, skip fetching remote
        if (repo.isDefault && isOfficialEnabled && fs.existsSync(LOCAL_DEV_EXTENSIONS_DIR)) {
          return
        }
        try {
          const res = await fetch(repo.url, { signal: AbortSignal.timeout(8000) })
          if (res.ok) {
            const items = await res.json()
            if (Array.isArray(items)) {
              const baseUrl = repo.url.replace(/index\.min\.json(\?.*)?$/i, '')
              for (const item of items) {
                if (!availableMap.has(item.id)) {
                  availableMap.set(item.id, {
                    ...item,
                    repoId: repo.id,
                    repoName: repo.name,
                    downloadUrl: `${baseUrl}${item.id}.js`,
                  })
                }
              }
            }
          }
        } catch (err) {
          log.warn({ err, repo: repo.name, url: repo.url }, 'Failed to fetch extension repo index')
        }
      })
    )

    // Map installed states
    return Array.from(availableMap.values()).map((item) => {
      const installed = this.installedRecords.get(item.id)
      const currentVer = installed?.metadata?.version
      const hasUpdate = !!installed && currentVer !== item.version
      return {
        ...item,
        installed: !!installed,
        isInstalled: !!installed,
        currentVersion: currentVer,
        installedVersion: currentVer,
        hasUpdate,
        isBuiltin: installed?.isBuiltin ?? false,
      }
    })
  }

  public async install(id: string, customDownloadUrl?: string): Promise<{ success: boolean; error?: string }> {
    const cleanId = id.toLowerCase().trim()
    const targetFile = path.join(this.extensionsDir, `${cleanId}.js`)

    // 1. Check if available locally
    const localSrc = path.join(LOCAL_DEV_EXTENSIONS_DIR, `${cleanId}.js`)
    if (fs.existsSync(localSrc)) {
      try {
        fs.copyFileSync(localSrc, targetFile)
        const ok = this.loadExtensionModule(targetFile, cleanId)
        return { success: ok }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }

    // 2. Download from downloadUrl or query available repos
    try {
      let downloadUrl = customDownloadUrl
      if (!downloadUrl) {
        const available = await this.getAvailable()
        const found = available.find((a) => a.id === cleanId)
        downloadUrl = found?.downloadUrl || `${REMOTE_REPO_RAW_BASE}${cleanId}.js`
      }

      const res = await fetch(downloadUrl, { signal: AbortSignal.timeout(15000) })
      if (!res.ok) return { success: false, error: `Repository returned HTTP ${res.status}` }
      const content = await res.text()
      fs.writeFileSync(targetFile, content, 'utf8')
      const ok = this.loadExtensionModule(targetFile, cleanId)
      return { success: ok }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  }

  public uninstall(id: string): { success: boolean; error?: string } {
    const record = this.installedRecords.get(id)
    if (!record) return { success: false, error: 'Extension not found' }
    if (record.isBuiltin) return { success: false, error: 'Cannot uninstall built-in extension' }

    // Unload from runtime maps
    this.animeExtensions.delete(id)
    this.tvExtensions.delete(id)
    this.asmrExtensions.delete(id)
    this.installedRecords.delete(id)
    this.saveRegistry()

    // Delete file
    const targetFile = path.join(this.extensionsDir, `${id}.js`)
    if (fs.existsSync(targetFile)) {
      try {
        delete require.cache[require.resolve(targetFile)]
        fs.unlinkSync(targetFile)
      } catch (err) {
        log.warn({ err }, 'Could not delete extension bundle file')
      }
    }

    return { success: true }
  }

  public toggle(id: string, enabled?: boolean): { success: boolean; enabled: boolean } {
    const record = this.installedRecords.get(id)
    if (!record) return { success: false, enabled: false }
    if (record.isBuiltin) return { success: true, enabled: true }

    const nextState = enabled !== undefined ? enabled : !record.enabled
    record.enabled = nextState
    this.saveRegistry()

    const targetFile = path.join(this.extensionsDir, `${id}.js`)
    if (nextState) {
      if (fs.existsSync(targetFile)) {
        this.loadExtensionModule(targetFile, id)
      }
    } else {
      this.animeExtensions.delete(id)
      this.tvExtensions.delete(id)
      this.asmrExtensions.delete(id)
    }

    return { success: true, enabled: nextState }
  }

  public reload(): void {
    this.animeExtensions.clear()
    this.tvExtensions.clear()
    this.asmrExtensions.clear()
    this.registerBuiltin(shokoProvider)
    this.loadAllFromDisk()
  }
}

export const extensionManager = new ExtensionManager()
