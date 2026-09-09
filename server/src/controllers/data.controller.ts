import { Request, Response } from 'express'
import { Provider, Show } from '../providers/provider.interface'
import { pickBestMatch } from '../providers/title-matching'
import { genres, tags, studios } from '../constants.json'
import {
  getTrending,
  getLatestReleases,
  getSeasonal,
  getShowMetaById,
  getAnilistEpisodes,
  getSchedule,
  searchAnilist,
  setCachedAnilist,
  getSpotlightBanners,
  getBatchedHomeData,
  anilistUnavailable,
  wasAnilistDownAtBoot,
  checkAnilistStatus,
} from '../lib/anilist'
import { getMigratedId } from '../lib/migration'
import { ShowsMetaRepository } from '../repositories/shows-meta.repository'
import { WatchlistRepository } from '../repositories/watchlist.repository'
import { SettingsRepository } from '../repositories/settings.repository'
import { animeIdMapper } from '../lib/anime-id-mapper'
import { shokoClient } from '../lib/shoko.client'
import logger from '../logger'
import { getExtensionContext } from '../utils/request-context'
import { extensionManager } from '../extensions/extension-manager'
import { flareSolverrService } from '../services/flaresolverr.service'

export class DataController {
  private getProviderByName: (name: string) => Provider | null

  constructor(providers: { [key: string]: Provider } | ((name: string) => Provider | null)) {
    if (typeof providers === 'function') {
      this.getProviderByName = providers
    } else {
      this.getProviderByName = (name: string) => providers[name] || null
    }
  }

  private getProvider(req: Request): Provider | null {
    const providerName = (req.query.provider as string)?.toLowerCase()
    if (!providerName) return null
    return this.getProviderByName(providerName)
  }

  getTrending = async (_req: Request, res: Response) => {
    try {
      const data = await getTrending(1, 20, 'TRENDING_DESC', 'RELEASING')
      res.set('Cache-Control', 'public, max-age=300').json(data)
    } catch (e) {
      logger.error({ err: e }, 'Trending fetch failed')
      res.json([])
    }
  }

  getSpotlight = async (_req: Request, res: Response) => {
    try {
      const data = await getSpotlightBanners(1, 20)
      res.set('Cache-Control', 'public, max-age=300').json(data)
    } catch (e) {
      logger.error({ err: e }, 'Spotlight fetch failed')
      res.json([])
    }
  }

  getPopularList = async (req: Request, res: Response) => {
    const sort =
      (req.query.sort as string) === 'POPULARITY_DESC' ? 'POPULARITY_DESC' : 'TRENDING_DESC'
    const page = parseInt(req.query.page as string) || 1
    const size = parseInt(req.query.size as string) || 20
    try {
      const data = await getTrending(page, size, sort)
      res.set('Cache-Control', 'public, max-age=300').json(data)
    } catch (e) {
      logger.error({ err: e }, 'Popular list fetch failed')
      res.json([])
    }
  }

  getSchedule = async (req: Request, res: Response) => {
    try {
      const date = new Date(req.params.date + 'T00:00:00.000Z')
      const format = (req.query.format as string) || undefined
      const adult = format === 'ADULT'
      const data = await getSchedule(date, adult ? undefined : format, adult)
      res.set('Cache-Control', 'public, max-age=300').json(data)
    } catch (e) {
      logger.error({ err: e, date: req.params.date }, 'Schedule fetch failed')
      res.json([])
    }
  }

  getSkipTimes = async (req: Request, res: Response) => {
    try {
      const showId = req.params.showId as string
      const episodeNumber = req.params.episodeNumber as string
      if (/^\d+$/.test(showId)) {
        const skipRes = await fetch(
          `https://api.aniskip.com/v1/skip-times/${showId}/${episodeNumber}?types=op&types=ed`
        )
        if (skipRes.ok) {
          const data = await skipRes.json()
          return res.json(data)
        }
      }
      res.json({ found: false, results: [] })
    } catch {
      res.json({ found: false, results: [] })
    }
  }

  getVideo = async (req: Request, res: Response) => {
    let showId = req.query.showId as string
    try {
      const providerName = req.query.provider as string
      const episodeNumber = (req.query.episodeNumber as string) || '1'

      // Check media playback mode (web, mixed, local)
      let mediaMode = (req.query.mediaMode as string)?.toLowerCase()
      if (!mediaMode) {
        const modeSetting = await SettingsRepository.getByKey(req.db, 'media_mode')
        mediaMode = (modeSetting?.value as string)?.toLowerCase() || 'web'
      }

      // If in Local Only or Mixed mode, or if provider is specifically 'shoko'
      const shokoProvider = this.getProviderByName('shoko')
      if (
        shokoProvider &&
        (mediaMode === 'local' || mediaMode === 'mixed' || providerName?.toLowerCase() === 'shoko')
      ) {
        try {
          const localSources = await shokoProvider.getStreamUrls(
            showId,
            episodeNumber,
            req.query.mode as 'sub' | 'dub'
          )
          if (localSources && localSources.length > 0) {
            return res.json(localSources)
          }

          // If Local Only mode and not found in Shoko, do not fall back to web
          if (mediaMode === 'local' || providerName?.toLowerCase() === 'shoko') {
            return res.json([])
          }
        } catch (err) {
          logger.warn({ err, showId, episodeNumber }, 'Shoko stream check failed, falling back if mixed')
          if (mediaMode === 'local' || providerName?.toLowerCase() === 'shoko') return res.json([])
        }
      }

      if (providerName?.toLowerCase() === 'shoko') {
        return res.json([])
      }

      const providerKey = providerName?.toLowerCase()
      if (providerKey && /^\d+$/.test(showId) && providerKey !== 'megaplay' && providerKey !== 'shoko') {
        const meta = (await ShowsMetaRepository.getById(req.db, showId)) as {
          name?: string
          englishName?: string
        } | null
        let targetTitle = meta?.englishName || meta?.name
        let anilistShow: Show | null = null

        if (!targetTitle) {
          try {
            anilistShow = await getShowMetaById(showId)
            targetTitle = anilistShow?.englishName || anilistShow?.name

            if (anilistShow && targetTitle) {
              await ShowsMetaRepository.upsert(req.db, {
                id: showId,
                name: anilistShow.name,
                thumbnail: anilistShow.thumbnail,
                nativeName: anilistShow.nativeName,
                englishName: anilistShow.englishName,
                genres: anilistShow.genres
                  ? JSON.stringify(anilistShow.genres.map((genre) => genre.name))
                  : undefined,
                status: anilistShow.status,
                episodeCount:
                  anilistShow.episodeCount != null ? Number(anilistShow.episodeCount) : undefined,
                type: anilistShow.type,
                anilistId: anilistShow.anilistId,
              })
            }
          } catch (err) {
            logger.warn(
              { err, provider: providerKey, showId },
              '[Video] AniList metadata lookup failed while resolving numeric showId'
            )
          }
        }

        if (targetTitle) {
          let romaji = anilistShow?.names?.romaji
          if (!romaji) {
            try {
              const show = await getShowMetaById(showId)
              romaji = show?.names?.romaji
            } catch {
              // A title from local metadata is still enough to attempt provider resolution.
            }
          }
          const targetProvider = this.getProviderByName(providerKey)
          const resolved = await targetProvider?.resolveShowId?.(
            targetTitle,
            romaji,
            req.query.mode as 'sub' | 'dub' | undefined
          )
          if (resolved) {
            showId = resolved
          } else {
            logger.warn(
              { provider: providerKey, showId, title: targetTitle, romaji },
              '[Video] resolveShowId failed, attempting fallback provider search'
            )
            try {
              const fallbackResults = await targetProvider?.search?.({
                query: targetTitle,
              })
              const targets = [targetTitle, romaji].filter(
                (t): t is string => !!t && t.trim().length > 0
              )
              const fallbackMatch = pickBestMatch(
                (fallbackResults || []).map((r) => ({
                  title: r.name || r.englishName || '',
                  id: r.id || r._id || '',
                })),
                targets
              )
              if (fallbackMatch) {
                showId = fallbackMatch.item.id
              } else {
                logger.warn(
                  { provider: providerKey, showId, title: targetTitle },
                  '[Video] fallback provider search returned no results'
                )
                return res.json([])
              }
            } catch (fallbackErr) {
              if ((fallbackErr as Error).message === 'AUTH_REQUIRED') {
                throw fallbackErr
              }
              logger.error(
                { err: fallbackErr, provider: providerKey, showId, title: targetTitle },
                '[Video] fallback provider search failed'
              )
              return res.json([])
            }
          }
        } else {
          logger.warn(
            { provider: providerKey, showId },
            '[Video] numeric showId passed to provider but local meta missing title'
          )
          return res.json([])
        }
      }

      const activeProviderKey = providerKey || 'allanime'
      const provider = this.getProvider(req)
      if (!provider) return res.json([])
      const extContext = getExtensionContext(activeProviderKey, req.headers)
      const urls = await provider.getStreamUrls(
        showId,
        req.query.episodeNumber as string,
        req.query.mode as 'sub' | 'dub',
        extContext
      )
      res.json(urls || [])
    } catch (e) {
      const activeProviderKey = (req.query.provider as string)?.toLowerCase() || 'allanime'
      if ((e as Error).message === 'AUTH_REQUIRED') {
        const provider = this.getProvider(req)
        const authUrl =
          (provider as any)?.metadata?.authUrl ||
          (activeProviderKey === 'animepahe' ? 'https://animepahe.pw' : undefined)

        if (authUrl && (await flareSolverrService.isEnabled(req.db))) {
          const solved = await flareSolverrService.solveAndCache(activeProviderKey, authUrl, req.db)
          if (solved.success && provider) {
            try {
              const retryContext = getExtensionContext(activeProviderKey, req.headers)
              const urls = await provider.getStreamUrls(
                showId,
                req.query.episodeNumber as string,
                req.query.mode as 'sub' | 'dub',
                retryContext
              )
              return res.json(urls || [])
            } catch (retryErr) {
              logger.warn({ err: retryErr }, 'Retry after FlareSolverr solve failed')
            }
          }
        }

        return res.status(403).json({
          error: 'AUTH_REQUIRED',
          provider: activeProviderKey,
          name: (provider as any)?.metadata?.name,
          authUrl,
        })
      }
      logger.error({ err: e, provider: req.query.provider }, 'Provider video fetch failed')
      res.json([])
    }
  }

  getEpisodes = async (req: Request, res: Response) => {
    const showIdRaw = req.query.showId as string

    if (!showIdRaw) {
      return res.json({ episodes: [] })
    }

    const showId = await getMigratedId(req.db, showIdRaw)

    const shokoProviderInstance = this.getProviderByName('shoko')
    if (showId.startsWith('shoko:') && shokoProviderInstance) {
      try {
        const data = await shokoProviderInstance.getEpisodes(showId, req.query.mode as 'sub' | 'dub')
        return res.json(data || { episodes: [] })
      } catch {
        return res.json({ episodes: [] })
      }
    }

    const animepaheProvider = this.getProviderByName('animepahe')
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(showId)) {
      try {
        if (animepaheProvider) {
          const extContext = getExtensionContext('animepahe', req.headers)
          const data = await animepaheProvider.getEpisodes(
            showId,
            req.query.mode as 'sub' | 'dub',
            extContext?.ua,
            extContext?.cookie,
            extContext
          )
          return res.json(data || { episodes: [] })
        }
      } catch (err) {
        if ((err as Error).message === 'AUTH_REQUIRED') {
          if (await flareSolverrService.isEnabled(req.db)) {
            const solved = await flareSolverrService.solveAndCache('animepahe', 'https://animepahe.pw', req.db)
            if (solved.success && animepaheProvider) {
              try {
                const retryContext = getExtensionContext('animepahe', req.headers)
                const data = await animepaheProvider.getEpisodes(
                  showId,
                  req.query.mode as 'sub' | 'dub',
                  retryContext?.ua,
                  retryContext?.cookie,
                  retryContext
                )
                return res.json(data || { episodes: [] })
              } catch (retryErr) {
                logger.warn({ err: retryErr }, 'Retry getEpisodes after FlareSolverr solve failed')
              }
            }
          }
          return res.status(403).json({
            error: 'AUTH_REQUIRED',
            provider: 'animepahe',
            authUrl: 'https://animepahe.pw',
          })
        }
        return res.json({ episodes: [] })
      }
    }

    // Check media playback mode
    let mediaMode = (req.query.mediaMode as string)?.toLowerCase()
    if (!mediaMode) {
      const modeSetting = await SettingsRepository.getByKey(req.db, 'media_mode')
      mediaMode = (modeSetting?.value as string)?.toLowerCase() || 'web'
    }

    // Check Shoko local availability
    let shokoDetails: any = null
    if (
      shokoProviderInstance &&
      (mediaMode === 'local' || mediaMode === 'mixed' || req.query.provider === 'shoko')
    ) {
      try {
        shokoDetails = await shokoProviderInstance.getEpisodes(showId, req.query.mode as 'sub' | 'dub')
      } catch {}
    }

    if (mediaMode === 'local' && shokoDetails?.episodes?.length) {
      return res.json(shokoDetails)
    }

    const isNumeric = /^\d+$/.test(showId)

    if (isNumeric) {
      let episodes: string[] = []
      try {
        episodes = await getAnilistEpisodes(showId)

        if (episodes.length === 0) {
          episodes = await this.tryProviderEpisodesFallback(showId, req.query.mode as 'sub' | 'dub')
          if (episodes.length > 0) {
            setCachedAnilist(`eps:${showId}`, episodes)
          }
        }
      } catch (e) {
        logger.error({ err: e, showId }, 'Episodes fetch failed')
      }

      // If Shoko has local episode details, merge them
      if (shokoDetails?.availableEpisodesDetail?.length) {
        const localDetailMap = new Map(
          shokoDetails.availableEpisodesDetail.map((d: any) => [d.number, d])
        )
        const combinedEpisodes = Array.from(new Set([...episodes, ...shokoDetails.episodes]))
        return res.set('Cache-Control', 'public, max-age=60').json({
          episodes: combinedEpisodes,
          availableEpisodesDetail: combinedEpisodes.map((num) => {
            const local = localDetailMap.get(num)
            return local || { number: num }
          }),
        })
      }

      res.set('Cache-Control', 'public, max-age=3600').json({ episodes })
      return
    }

    const providerName = (req.query.provider as string)?.toLowerCase()
    const provider = providerName ? this.getProviderByName(providerName) : this.getProviderByName('anidb')
    if (provider) {
      try {
        const data = await provider.getEpisodes(showId, req.query.mode as 'sub' | 'dub')
        if (data?.episodes?.length) {
          return res.json(data)
        }
      } catch {
        // ignore
      }
    }

    res.json({ episodes: [] })
  }

  search = async (req: Request, res: Response) => {
    try {
      const query = (req.query.query as string) || ''
      const page = parseInt(req.query.page as string) || 1
      const perPage = parseInt(req.query.limit as string) || 14
      const sort = (req.query.sortBy as string) || undefined

      const result = await searchAnilist({
        query,
        page,
        perPage,
        format: req.query.type as string,
        status: req.query.status as string,
        season: req.query.season as string,
        seasonYear: req.query.year ? parseInt(req.query.year as string) : undefined,
        countryOfOrigin: req.query.country as string,
        genre: req.query.genres as string,
        genre_not_in: req.query.excludeGenres
          ? (req.query.excludeGenres as string).split(',')
          : undefined,
        tag_not_in: req.query.excludeTags
          ? (req.query.excludeTags as string).split(',')
          : undefined,
        averageScore_greater: req.query.minScore
          ? parseInt(req.query.minScore as string)
          : undefined,
        episodes_greater: req.query.minEpisodes
          ? parseInt(req.query.minEpisodes as string)
          : undefined,
        isAdult:
          req.query.adult === 'true' ? true : req.query.adult === 'false' ? false : undefined,
        sort,
      })
      return res.json(result)
    } catch (e) {
      logger.error({ err: e }, 'search failed')
      res.json([])
    }
  }

  getSeasonal = async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1
    const size = parseInt(req.query.size as string) || 14
    const format = req.query.format as string | undefined
    try {
      const data = await getSeasonal(page, size, format)
      res.set('Cache-Control', 'public, max-age=300').json(data)
    } catch (e) {
      logger.error({ err: e }, 'Seasonal fetch failed')
      res.json([])
    }
  }

  getLatestReleases = async (req: Request, res: Response) => {
    const format = (req.query.format as string) || 'TV'
    const page = parseInt(req.query.page as string) || 1
    const size = parseInt(req.query.size as string) || 12
    try {
      const data = await getLatestReleases(format, page, size)
      res.set('Cache-Control', 'public, max-age=300').json(data)
    } catch (e) {
      logger.error({ err: e }, 'Latest releases fetch failed')
      res.json([])
    }
  }

  getShowMeta = async (req: Request, res: Response) => {
    const showIdRaw = req.params.id as string
    const id = await getMigratedId(req.db, showIdRaw)

    if (id.startsWith('shoko:')) {
      try {
        const seriesId = parseInt(id.replace('shoko:', ''), 10)
        const series = await shokoClient.getSeriesById(seriesId, req.db)
        if (series) {
          const posterObj =
            series.Images?.Posters?.find((p) => p.Preferred) ||
            series.Images?.Posters?.[0] ||
            series.AniDB?.Poster
          const bannerObj =
            series.Images?.Backdrops?.find((b) => b.Preferred) ||
            series.Images?.Backdrops?.[0] ||
            series.Images?.Banners?.find((b) => b.Preferred) ||
            series.Images?.Banners?.[0]

          const posterUrl = posterObj?.ID
            ? `/api/shoko/image/${posterObj.Source || 'AniDB'}/${posterObj.Type || 'Poster'}/${posterObj.ID}`
            : undefined

          const bannerUrl = bannerObj?.ID
            ? `/api/shoko/image/${bannerObj.Source || 'TMDB'}/${bannerObj.Type || 'Backdrop'}/${bannerObj.ID}`
            : undefined

          const showObj: Show = {
            _id: `shoko:${series.IDs.ID}`,
            id: `shoko:${series.IDs.ID}`,
            name: series.Name || series.AniDB?.Title || 'Unknown Anime',
            englishName: series.AniDB?.Title || series.Name,
            thumbnail: posterUrl,
            bannerImage: bannerUrl,
            description: series.AniDB?.Description,
            episodeCount: series.Sizes?.Local?.Normal ?? series.AniDB?.EpisodeCount ?? 0,
            type: series.AniDB?.Type || 'TV',
          }
          return res.set('Cache-Control', 'public, max-age=3600').json(showObj)
        }
      } catch (err) {
        logger.error({ err, id }, 'Failed to fetch Shoko series meta')
      }
    }

    const isNumeric = /^\d+$/.test(id)

    if (isNumeric) {
      let meta: Show | null = null
      try {
        meta = await getShowMetaById(id)

        // Augment with high-res Shoko artwork if available
        try {
          const anidbId = animeIdMapper.getAnidbIdByAnilist(parseInt(id, 10))
          if (anidbId) {
            const shokoSeries = await shokoClient.getSeriesByAnidbId(anidbId, req.db)
            if (shokoSeries) {
              const posterObj =
                shokoSeries.Images?.Posters?.find((p) => p.Preferred) ||
                shokoSeries.Images?.Posters?.[0]
              const bannerObj =
                shokoSeries.Images?.Backdrops?.find((b) => b.Preferred) ||
                shokoSeries.Images?.Backdrops?.[0] ||
                shokoSeries.Images?.Banners?.find((b) => b.Preferred) ||
                shokoSeries.Images?.Banners?.[0]

              if (posterObj?.ID && meta) {
                meta.thumbnail = `/api/shoko/image/${posterObj.Source || 'AniDB'}/${posterObj.Type || 'Poster'}/${posterObj.ID}`
              }
              if (bannerObj?.ID && meta) {
                meta.bannerImage = `/api/shoko/image/${bannerObj.Source || 'TMDB'}/${bannerObj.Type || 'Backdrop'}/${bannerObj.ID}`
              }
            }
          }
        } catch {}
      } catch (e) {
        logger.warn({ err: e, id }, 'AniList show-meta fetch failed, trying local cache')
        const localMeta = (await ShowsMetaRepository.getById(req.db, id)) as Record<
          string,
          unknown
        > | null
        if (localMeta) {
          if (typeof localMeta.genres === 'string') {
            try {
              localMeta.genres = JSON.parse(localMeta.genres as string)
            } catch {
              localMeta.genres = []
            }
          }
          res.set('Cache-Control', 'public, max-age=3600').json(localMeta)
          return
        }
      }

      if (meta) {
        ShowsMetaRepository.upsert(req.db, {
          id,
          name: meta.name,
          thumbnail: meta.thumbnail,
          nativeName: meta.nativeName,
          englishName: meta.englishName,
          genres: meta.genres
            ? JSON.stringify(
                meta.genres.map((g) => (typeof g === 'string' ? g : g?.name)).filter(Boolean)
              )
            : undefined,
          status: meta.status,
          episodeCount: meta.episodeCount != null ? Number(meta.episodeCount) : undefined,
          type: meta.type,
          anilistId: meta.anilistId,
        })

        const existingWatchlist = (await WatchlistRepository.getById(req.db, id)) as {
          thumbnail?: string
        } | null
        if (existingWatchlist && existingWatchlist.thumbnail !== (meta.thumbnail || '')) {
          WatchlistRepository.updateThumbnail(req.db, id, meta.thumbnail || '')
        }
      }

      res.set('Cache-Control', 'public, max-age=3600').json(meta || {})
      return
    }

    res.json({})
  }

  getGenresAndTags = (_req: Request, res: Response) => {
    res.json({ genres, tags, studios })
  }

  getAnilistStatus = async (_req: Request, res: Response) => {
    const available = !anilistUnavailable()
    if (!available) {
      checkAnilistStatus().catch(() => {})
    }
    res.json({ available, wasDownAtBoot: wasAnilistDownAtBoot() })
  }

  getSystemNotifications = async (_req: Request, res: Response) => {
    interface SystemNotification {
      id: string
      type: string
      title: string
      message: string
      icon: string
      createdAt: number
    }
    const notifications: SystemNotification[] = []
    if (wasAnilistDownAtBoot() && anilistUnavailable()) {
      notifications.push({
        id: 'system-anilist-down',
        type: 'system',
        title: 'AniList API',
        message:
          'AniList metadata API is currently down. dango is experiencing degraded performance. Kitsu is being used as a fallback in the meantime. Some features may be limited until service is restored.',
        icon: 'warning',
        createdAt: Date.now(),
      })
    }
    try {
      const updates = await extensionManager.checkUpdates()
      if (updates && updates.length > 0) {
        const extNames = updates.map((u) => `${u.name} (v${u.currentVersion} → v${u.latestVersion})`).join(', ')
        notifications.push({
          id: 'system-extension-updates',
          type: 'system',
          title: 'Extension Updates Available',
          message: `Update${updates.length > 1 ? 's are' : ' is'} available for: ${extNames}. Update them in Settings → Extensions.`,
          icon: 'info',
          createdAt: Date.now(),
        })
      }
    } catch (err) {
      logger.warn({ err }, 'Could not check extension updates for system notifications')
    }
    res.json(notifications)
  }

  getBatchedHome = async (req: Request, res: Response) => {
    try {
      const format = (req.query.format as string) || undefined
      const data = await getBatchedHomeData(format)
      res.set('Cache-Control', 'public, max-age=300').json(data)
    } catch (e) {
      logger.error({ err: e }, 'Batched home fetch failed')
      res.json({ trending: [], seasonal: [], spotlight: [] })
    }
  }

  private tryProviderEpisodesFallback = async (
    showId: string,
    mode: 'sub' | 'dub'
  ): Promise<string[]> => {
    try {
      const meta = await getShowMetaById(showId)
      const title = meta?.name || meta?.englishName || meta?.nativeName
      if (!title) return []

      // anidb provides complete, normalized episode lists even when AniList
      // has no episodeCount (e.g. One Piece) or wrong data (e.g. Detective Conan)
      const provider = this.getProviderByName('anidb')
      if (!provider) return []

      const searchResults = await provider.search({ query: title })
      if (!searchResults || searchResults.length === 0) return []

      const providerShowId = searchResults[0]._id || searchResults[0].id
      if (!providerShowId) return []

      const episodesData = await provider.getEpisodes(providerShowId, mode)
      if (episodesData?.episodes?.length) return episodesData.episodes
      return []
    } catch {
      return []
    }
  }
}
