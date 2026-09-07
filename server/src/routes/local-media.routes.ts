import { Router } from 'express'
import { localMediaController } from '../controllers/local-media.controller'

export function createLocalMediaRouter(): Router {
  const router = Router()

  // Video and subtitle streaming
  router.get('/local-media/stream/:fileId', localMediaController.streamVideo)
  router.get('/local-media/subtitle/:fileId/:trackIndex', localMediaController.streamSubtitle)

  // Shoko artwork proxy
  router.get('/shoko/image/:source/:type/:id', localMediaController.proxyImage)
  router.get('/shoko/image/:imageGUID', localMediaController.proxyImage)

  // Scrobbling & Watched state sync
  router.post('/shoko/scrobble', localMediaController.scrobble)

  // Connection & Auth
  router.get('/shoko/test', localMediaController.testConnection)
  router.post('/shoko/login', localMediaController.login)

  // Local series & files
  router.get('/shoko/local-series', localMediaController.getLocalSeries)
  router.get('/shoko/search', localMediaController.searchLocalSeries)
  router.get('/shoko/recent', localMediaController.getRecentFiles)
  router.get('/shoko/recently-added-episodes', localMediaController.getRecentlyAddedEpisodes)
  router.get('/shoko/calendar', localMediaController.getCalendar)
  router.get('/shoko/seasonal', localMediaController.getSeasonal)
  router.get('/shoko/top-rated', localMediaController.getTopRated)
  router.get('/shoko/spotlight', localMediaController.getSpotlight)

  // Anime offline database
  router.post('/shoko/refresh-anime-db', localMediaController.refreshAnimeDb)
  router.get('/shoko/anime-db-status', localMediaController.getAnimeDbStatus)

  // Hardware acceleration & transcoding info
  router.get('/local-media/capabilities', localMediaController.getCapabilities)

  return router
}
