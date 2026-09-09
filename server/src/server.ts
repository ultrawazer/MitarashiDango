process.setMaxListeners(100)
import { EventEmitter } from 'events'
EventEmitter.defaultMaxListeners = 100
import express from 'express'
import path from 'path'
import cors from 'cors'
import compression from 'compression'
import NodeCache from 'node-cache'
import fs from 'fs'
import { DatabaseWrapper } from './db'
import chokidar from 'chokidar'
import logger from './logger'
import { notifyServerExit } from './lib/ipc'
import { crossSiteProtectionMiddleware, isAllowedOrigin } from './utils/security.utils'

import { shokoProvider } from './providers/shoko.provider'
import { extensionManager } from './extensions/extension-manager'
import { createExtensionRouter } from './routes/extension.routes'
import { shokoClient } from './lib/shoko.client'
import { createLocalMediaRouter } from './routes/local-media.routes'
import { animeIdMapper } from './lib/anime-id-mapper'
import { githubSyncService } from './github-sync'
import { CONFIG } from './config'
import {
  initializeDatabase,
  syncDownOnBoot,
  syncUp,
  initSyncProvider,
  waitForSync,
  getActiveProvider,
} from './sync'
import { createAuthRouter } from './routes/auth.routes'
import { createLanAuthRouter } from './routes/lan-auth.routes'
import { lanAuthMiddleware } from './app-auth'
import { createWatchlistRouter } from './routes/watchlist.routes'
import { createDataRouter } from './routes/data.routes'
import { createAsmrRouter } from './routes/asmr.routes'
import { createRadioRouter } from './routes/radio.routes'
import { createTvRouter } from './routes/tv.routes'
import { createProxyRouter } from './routes/proxy.routes'
import { createSettingsRouter } from './routes/settings.routes'
import { createInsightsRouter } from './routes/insights.routes'
import { createTranslateRouter } from './routes/translate.routes'
import { createDiscordGatewayRouter } from './routes/discord-gateway.routes'
import { createTrackerRouter } from './routes/tracker.routes'
import { createFlareSolverrRouter } from './routes/flaresolverr.routes'
import { flareSolverrService } from './services/flaresolverr.service'
import { discordRPCService } from './discord-rpc'
import { discordGatewayService } from './discord-gateway'
import { SettingsRepository } from './repositories/settings.repository'
import { requestContext } from './utils/request-context'
import { checkAnilistStatus } from './lib/anilist'

declare module 'express-serve-static-core' {
  interface Request {
    db: DatabaseWrapper
  }
}

const app = express()

app.use((req, res, next) => {
  const store = new Map<string, string>()

  // Generic extension headers: x-ext-<id>-cookie, x-ext-<id>-ua
  for (const [key, val] of Object.entries(req.headers)) {
    if (typeof val === 'string' && key.startsWith('x-ext-')) {
      store.set(key, val)
    }
  }

  // Legacy headers
  if (req.headers['x-animepahe-ua']) {
    store.set('ua', req.headers['x-animepahe-ua'] as string)
    store.set('x-ext-animepahe-ua', req.headers['x-animepahe-ua'] as string)
  }
  if (req.headers['x-animepahe-cookie']) {
    store.set('cookie', req.headers['x-animepahe-cookie'] as string)
    store.set('x-ext-animepahe-cookie', req.headers['x-animepahe-cookie'] as string)
  }
  if (req.headers['x-jasmr-ua']) {
    store.set('jasmr_ua', req.headers['x-jasmr-ua'] as string)
    store.set('x-ext-jasmr-ua', req.headers['x-jasmr-ua'] as string)
  }
  if (req.headers['x-jasmr-cookie']) {
    store.set('jasmr_cookie', req.headers['x-jasmr-cookie'] as string)
    store.set('x-ext-jasmr-cookie', req.headers['x-jasmr-cookie'] as string)
  }
  requestContext.run(store, next)
})

// Extension Manager provides dynamic providers (with Shoko built-in)
const apiCache = new NodeCache({ stdTTL: 3600 })

let db: DatabaseWrapper
let isShuttingDown = false

async function runSyncSequence(
  database: DatabaseWrapper,
  preferredProvider?: 'github' | 'google' | 'rclone' | 'none'
) {
  const dbName = CONFIG.IS_DEV ? CONFIG.DB_NAME_DEV : CONFIG.DB_NAME_PROD
  const dbPath = path.join(CONFIG.ROOT, dbName)
  const remoteFolder = CONFIG.IS_DEV ? CONFIG.REMOTE_FOLDER_DEV : CONFIG.REMOTE_FOLDER_PROD

  await initSyncProvider(preferredProvider)

  if (getActiveProvider() === 'github' && githubSyncService.isAuthenticated()) {
    try {
      await githubSyncService.migrateFromAniWebSync()
    } catch (err) {
      logger.error({ err }, 'GitHub sync migration from ani-web failed')
    }
  }

  const didDownload = await syncDownOnBoot(database, dbPath, remoteFolder, () => {
    return new Promise<void>((resolve) => {
      if (database && !database.isClosedCheck()) {
        database.checkpoint()
        database.close(() => resolve())
      } else {
        resolve()
      }
    })
  })

  let currentDb = database
  if (didDownload) {
    db = await initializeDatabase(dbPath)
    currentDb = db
    logger.info('Database re-initialized after sync.')
  }

  try {
    await syncUp(currentDb, dbPath, remoteFolder)
  } catch (err) {
    logger.error({ err }, 'Sync up on boot failed')
  }
}

app.use((req, res, next) => {
  if (isShuttingDown) {
    return res.status(503).send('Server is shutting down...')
  }
  if (!db) {
    return res.status(503).send('Database initializing...')
  }
  req.db = db
  next()
})

app.use(
  compression({
    level: 2,
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false
      }
      return compression.filter(req, res)
    },
  })
)

app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, isAllowedOrigin(origin))
    },
    credentials: true,
  })
)
app.use(crossSiteProtectionMiddleware)
app.use(express.json({ limit: '10mb' }))

app.use('/api/auth', createLanAuthRouter())
app.use(lanAuthMiddleware)

app.use(
  '/api/auth',
  createAuthRouter((database) => runSyncSequence(database))
)

const { router: watchlistRouter, stopDiscovery } = createWatchlistRouter(() => db)
app.use('/api', watchlistRouter)
app.use('/api', createDataRouter(apiCache, (name) => extensionManager.getAnimeProvider(name)))
app.use('/api', createAsmrRouter(apiCache, (id) => extensionManager.getAsmrProvider(id)))
app.use('/api', createRadioRouter(apiCache))
app.use('/api', createTvRouter(apiCache, (id) => extensionManager.getTvProvider(id)))
app.use('/api', createExtensionRouter(extensionManager))
app.use('/api', createProxyRouter())
app.use('/api', createInsightsRouter())
app.use('/api', createTranslateRouter())
app.use('/api', createDiscordGatewayRouter())
app.use('/api', createTrackerRouter())
app.use('/api', createLocalMediaRouter())
app.use('/api', createFlareSolverrRouter())
app.use(
  '/api',
  createSettingsRouter(
    () => db,
    initializeDatabase,
    (newDb) => {
      db = newDb
      shokoClient.setDb(newDb)
      flareSolverrService.setDb(newDb)
    }
  )
)

if (!CONFIG.IS_DEV) {
  const frontendPath = path.join(CONFIG.PACKAGE_ROOT, 'client', 'dist')
  logger.info(`Serving frontend from: ${frontendPath}`)
  app.use(express.static(frontendPath))

  app.get(/^(?!\/api).+/, (req, res) => {
    res.sendFile('index.html', { root: frontendPath }, (err) => {
      if (err) {
        logger.error({ err }, `Failed to serve index.html from ${frontendPath}`)
        if (!res.headersSent) {
          res.status(500).send('Server Error: Frontend build not found.')
        }
      }
    })
  })
}

app.use(
  (
    err: Error & { status?: number },
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    logger.error({ err, url: req.url, method: req.method }, 'Unhandled error')

    if (res.headersSent) {
      return next(err)
    }

    res.status(err.status || 500).json({
      error: err.message || 'Internal Server Error',
      status: err.status || 500,
    })
  }
)

async function main() {
  const dbName = CONFIG.IS_DEV ? CONFIG.DB_NAME_DEV : CONFIG.DB_NAME_PROD
  const dbPath = path.join(CONFIG.ROOT, dbName)
  const remoteFolder = CONFIG.IS_DEV ? CONFIG.REMOTE_FOLDER_DEV : CONFIG.REMOTE_FOLDER_PROD

  db = await initializeDatabase(dbPath)
  logger.info(`Database initialized at ${dbPath}`)

  flareSolverrService.setDb(db)
  await extensionManager.init()

  shokoClient.init(db)
  await animeIdMapper.init(db)

  if (animeIdMapper.checkWeeklyUpdateDue(db)) {
    logger.info('Weekly offline database update is due on startup, starting background update...')
    animeIdMapper.executeScheduledUpdate(db).catch((err) => {
      logger.warn({ err: err?.message }, 'Startup scheduled offline database update failed')
    })
  }

  const rpcEnabledSetting = await SettingsRepository.getByKey(db, 'discordRPCEnabled')
  const isRpcEnabled = rpcEnabledSetting ? rpcEnabledSetting.value === 'true' : true
  await discordRPCService.setEnabled(isRpcEnabled)
  discordGatewayService.setEnabled(isRpcEnabled)

  checkAnilistStatus().catch(() => {})

  await runSyncSequence(db)

  if (!fs.existsSync(CONFIG.LOCAL_MANIFEST_PATH)) {
    fs.writeFileSync(CONFIG.LOCAL_MANIFEST_PATH, JSON.stringify({ version: 0 }))
  }

  let hasUnsyncedChanges = false

  const watcher = chokidar.watch(CONFIG.LOCAL_MANIFEST_PATH, {
    persistent: true,
    ignoreInitial: true,
  })

  const expressServer = app.listen(CONFIG.PORT, () => {
    logger.info(`Server running on http://localhost:${CONFIG.PORT}`)
  })

  watcher.on('change', () => {
    hasUnsyncedChanges = true
  })

  const syncInterval = setInterval(async () => {
    if (hasUnsyncedChanges) {
      logger.info('Uploading accumulated database changes...')
      hasUnsyncedChanges = false
      try {
        await syncUp(db, dbPath, remoteFolder)
      } catch (err) {
        logger.error({ err }, 'Failed to upload database changes')
        hasUnsyncedChanges = true
      }
    }
  }, 300000)

  const offlineDbInterval = setInterval(() => {
    if (animeIdMapper.checkWeeklyUpdateDue(db)) {
      logger.info('Weekly offline database update triggered by periodic schedule...')
      animeIdMapper.executeScheduledUpdate(db).catch((err) => {
        logger.warn({ err: err?.message }, 'Interval scheduled offline database update failed')
      })
    }
  }, 6 * 60 * 60 * 1000)

  const shutdown = async (signal?: string) => {
    if (isShuttingDown) return
    isShuttingDown = true
    stopDiscovery()
    clearInterval(syncInterval)
    clearInterval(offlineDbInterval)
    discordRPCService.disconnect()
    discordGatewayService.disconnect()
    await watcher.close()

    if (expressServer) {
      expressServer.close()
    }

    if (hasUnsyncedChanges) {
      logger.info('Sync on shutdown: uploading final database changes...')
      hasUnsyncedChanges = false
      try {
        await syncUp(db, dbPath, remoteFolder)
      } catch (e) {
        logger.error({ err: e }, 'Final sync on shutdown failed')
      }
    }

    await waitForSync()

    db.close(() => {
      notifyServerExit()
      if (signal === 'SIGUSR2') {
        process.kill(process.pid, 'SIGUSR2')
      }
    })
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGHUP', () => shutdown('SIGHUP'))
  process.once('SIGUSR2', () => shutdown('SIGUSR2'))

  app.post('/api/internal/shutdown', (req, res) => {
    if (req.ip === '::1' || req.ip === '127.0.0.1' || req.ip === '::ffff:127.0.0.1') {
      res.status(200).json({ message: 'Shutting down' })
      setTimeout(() => shutdown(), 500)
    } else {
      res.status(403).send('Forbidden')
    }
  })
}

main().catch((err) => {
  logger.error({ err }, 'Server failed to start')
  process.exit(1)
})
