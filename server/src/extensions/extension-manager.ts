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

export class ExtensionManager {
  private extensionsDir: string
  private installedJsonPath: string
  private installedRecords = new Map<string, InstalledExtensionRecord>()

  private animeExtensions = new Map<string, AnimeExtension>()
  private tvExtensions = new Map<string, TvExtension>()
  private asmrExtensions = new Map<string, AsmrExtension>()

  constructor(baseDir?: string) {
    const root = baseDir || path.resolve(__dirname, '..', '..')
    this.extensionsDir = path.join(root, 'data', 'extensions')
    this.installedJsonPath = path.join(this.extensionsDir, 'installed.json')
  }

  public async init(): Promise<void> {
    if (!fs.existsSync(this.extensionsDir)) {
      fs.mkdirSync(this.extensionsDir, { recursive: true })
    }

    // 1. Always register built-in Shoko provider
    this.registerBuiltin(shokoProvider)

    // 2. Load installed records registry
    this.loadRegistry()

    // 3. Auto-populate from local extensions repo if data/extensions is empty
    this.checkLocalDevAutoPopulate()

    // 4. Load all installed extension files from disk
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

  private checkLocalDevAutoPopulate(): void {
    // If local dev repo exists and data/extensions has no installed .js files yet, copy them in
    if (fs.existsSync(LOCAL_DEV_EXTENSIONS_DIR)) {
      const existingJs = fs
        .readdirSync(this.extensionsDir)
        .filter((f) => f.endsWith('.js') && !f.includes('installed'))
      if (existingJs.length === 0) {
        log.info('Auto-populating extensions from local dev repo: ' + LOCAL_DEV_EXTENSIONS_DIR)
        try {
          const files = fs.readdirSync(LOCAL_DEV_EXTENSIONS_DIR).filter((f) => f.endsWith('.js'))
          for (const f of files) {
            const src = path.join(LOCAL_DEV_EXTENSIONS_DIR, f)
            const dest = path.join(this.extensionsDir, f)
            fs.copyFileSync(src, dest)
          }
        } catch (err) {
          log.warn({ err }, 'Could not auto-populate from local dev extensions')
        }
      }
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

  // --- Management APIs ---

  public getInstalled(): InstalledExtensionRecord[] {
    return Array.from(this.installedRecords.values())
  }

  public async getAvailable(): Promise<
    (ExtensionMetadata & { pkg: string; isInstalled: boolean; installedVersion?: string })[]
  > {
    let available: (ExtensionMetadata & { pkg: string })[] = []

    // 1. Try local dev repo index first if available
    const localIndex = path.join(LOCAL_DEV_EXTENSIONS_DIR, 'index.min.json')
    if (fs.existsSync(localIndex)) {
      try {
        const raw = fs.readFileSync(localIndex, 'utf8')
        available = JSON.parse(raw)
      } catch (err) {
        log.warn({ err }, 'Failed to read local dev index.min.json')
      }
    }

    // 2. Fallback to remote GitHub repository
    if (available.length === 0) {
      try {
        const res = await fetch(REMOTE_REPO_INDEX_URL, { signal: AbortSignal.timeout(6000) })
        if (res.ok) {
          available = await res.json()
        }
      } catch (err) {
        log.warn({ err }, 'Failed to fetch remote extensions repo index')
      }
    }

    // Map installed state
    return available.map((item) => {
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

  public async install(id: string): Promise<{ success: boolean; error?: string }> {
    const cleanId = id.toLowerCase().trim()
    const targetFile = path.join(this.extensionsDir, `${cleanId}.js`)

    // 1. Check if available locally
    const localSrc = path.join(LOCAL_DEV_EXTENSIONS_DIR, `${cleanId}.js`)
    if (fs.existsSync(localSrc)) {
      try {
        fs.copyFileSync(localSrc, targetFile)
        this.loadExtensionModule(targetFile, cleanId)
        return { success: true }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }

    // 2. Download from remote repository
    try {
      const url = `${REMOTE_REPO_RAW_BASE}${cleanId}.js`
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
      if (!res.ok) return { success: false, error: `Remote returned HTTP ${res.status}` }
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
