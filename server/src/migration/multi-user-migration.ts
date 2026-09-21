import fs from 'fs'
import path from 'path'
import { CONFIG } from '../config'
import { DatabaseWrapper } from '../db'
import { setGlobalSetting } from '../system-db'
import logger from '../logger'

export function checkLegacyDataExists(): boolean {
  const prodDb = path.join(CONFIG.ROOT, CONFIG.DB_NAME_PROD)
  const devDb = path.join(CONFIG.ROOT, CONFIG.DB_NAME_DEV)
  return fs.existsSync(prodDb) || fs.existsSync(devDb)
}

function moveFileSafe(src: string, dest: string): void {
  if (!fs.existsSync(src)) return
  try {
    fs.renameSync(src, dest)
  } catch {
    fs.copyFileSync(src, dest)
    fs.unlinkSync(src)
  }
}

export async function migrateLegacyDataToAdmin(adminId: string): Promise<void> {
  const userDir = path.join(CONFIG.ROOT, 'users', adminId)
  fs.mkdirSync(userDir, { recursive: true })

  const filesToMigrate = [
    'anime.db',
    'anime.db-wal',
    'anime.db-shm',
    'anime.dev.db',
    'anime.dev.db-wal',
    'anime.dev.db-shm',
    'google_tokens.json',
    'sync_manifest.json',
    'sync_manifest.dev.json',
  ]

  logger.info({ adminId, userDir }, 'Migrating legacy single-user data to admin account')

  for (const file of filesToMigrate) {
    const src = path.join(CONFIG.ROOT, file)
    const dest = path.join(userDir, file)
    if (fs.existsSync(src)) {
      moveFileSafe(src, dest)
      logger.debug({ file, dest }, 'Moved legacy data file to admin directory')
    }
  }

  // Extract server-wide settings from the migrated DB into system.db global_settings
  const adminDbPath = path.join(
    userDir,
    CONFIG.IS_DEV ? CONFIG.DB_NAME_DEV : CONFIG.DB_NAME_PROD
  )

  if (fs.existsSync(adminDbPath)) {
    try {
      const db = await DatabaseWrapper.create(adminDbPath)
      const serverSettingKeys = [
        'shoko_url',
        'shoko_port',
        'shoko_api_key',
        'hwaccel_mode',
        'flaresolverr_enabled',
        'flaresolverr_url',
        'flaresolverr_port',
        'flaresolverr_max_timeout',
        'activeTheme',
      ]

      for (const key of serverSettingKeys) {
        try {
          const row = db.get<{ value: string }>(`SELECT value FROM settings WHERE key = ?`, [key])
          if (row && row.value !== undefined && row.value !== null) {
            const targetKey = key === 'activeTheme' ? 'serverTheme' : key
            setGlobalSetting(targetKey, row.value)
            logger.debug({ key, targetKey, value: row.value }, 'Migrated server setting to global_settings')
          }
        } catch {
          // ignore missing table or column during migration
        }
      }
      db.close()
    } catch (err) {
      logger.warn({ err }, 'Could not extract server settings from migrated admin database')
    }
  }

  logger.info('Legacy data migration to admin account complete')
}
