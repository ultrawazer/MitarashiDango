import {
  Provider,
  ExtensionMetadata,
  SearchOptions,
  Show,
  EpisodeDetails,
  EpisodeDetail,
  VideoSource,
  AudioTrack,
  SubtitleTrack,
} from './provider.interface'
import { shokoClient, ShokoSeries, ShokoEpisode } from '../lib/shoko.client'
import { animeIdMapper } from '../lib/anime-id-mapper'
import logger from '../logger'

const log = logger.child({ module: 'ShokoProvider' })

export class ShokoProvider implements Provider {
  public name = 'shoko'
  public readonly metadata: ExtensionMetadata = {
    id: 'shoko',
    name: 'Shoko (Local)',
    version: '1.0.0',
    type: 'anime',
    lang: 'all',
    mature: false,
    description: 'Local and self-hosted anime library managed by Shoko Server',
  }

  public async search(options: SearchOptions): Promise<Show[]> {
    try {
      const seriesList = await shokoClient.getSeriesList()
      const query = (options.query || '').trim().toLowerCase()

      const filtered = seriesList.filter((s) => {
        if (!query) return true
        const name = (s.Name || '').toLowerCase()
        const anidbTitle = (s.AniDB?.Title || '').toLowerCase()
        return name.includes(query) || anidbTitle.includes(query)
      })

      return filtered.map((s) => this.seriesToShow(s))
    } catch (err) {
      log.error({ err }, 'Shoko search failed')
      return []
    }
  }

  public async resolveShowId(
    title: string,
    romaji?: string,
    _mode?: 'sub' | 'dub'
  ): Promise<string | null> {
    try {
      // 1. If title is a numeric string (AniList ID)
      if (/^\d+$/.test(title)) {
        const anilistId = parseInt(title, 10)
        const anidbId = animeIdMapper.getAnidbIdByAnilist(anilistId)
        if (anidbId) {
          const series = await shokoClient.getSeriesByAnidbId(anidbId)
          if (series?.IDs?.ID) {
            return `shoko:${series.IDs.ID}`
          }
        }
      }

      // 2. Search series by title / romaji
      const seriesList = await shokoClient.getSeriesList()
      const cleanTitle = title.trim().toLowerCase()
      const cleanRomaji = (romaji || '').trim().toLowerCase()

      for (const s of seriesList) {
        const name = (s.Name || '').toLowerCase()
        const anidbTitle = (s.AniDB?.Title || '').toLowerCase()
        if (
          name === cleanTitle ||
          anidbTitle === cleanTitle ||
          (cleanRomaji && (name === cleanRomaji || anidbTitle === cleanRomaji))
        ) {
          return `shoko:${s.IDs.ID}`
        }
      }

      // Substring match fallback
      for (const s of seriesList) {
        const name = (s.Name || '').toLowerCase()
        const anidbTitle = (s.AniDB?.Title || '').toLowerCase()
        if (
          name.includes(cleanTitle) ||
          anidbTitle.includes(cleanTitle) ||
          (cleanRomaji && (name.includes(cleanRomaji) || anidbTitle.includes(cleanRomaji)))
        ) {
          return `shoko:${s.IDs.ID}`
        }
      }

      return null
    } catch (err) {
      log.error({ err, title, romaji }, 'Failed to resolve Shoko show ID')
      return null
    }
  }

  public async getEpisodes(
    showId: string,
    _mode?: 'sub' | 'dub'
  ): Promise<EpisodeDetails | null> {
    try {
      const numericSeriesId = await this.extractSeriesId(showId)
      if (!numericSeriesId) return null

      const episodes = await shokoClient.getSeriesEpisodes(numericSeriesId)
      if (!episodes || episodes.length === 0) return null

      const episodeNumbers: string[] = []
      const themeSongs: string[] = []
      const episodeDetails: EpisodeDetail[] = []
      const seenEpisodes = new Set<string>()

      // Sort episodes: Normal episodes first (1, 2, 3...), then Specials (SP1, SP2...), then ThemeSongs (OP1, ED1...)
      const sorted = [...episodes].sort((a, b) => {
        const typeOrder: Record<string, number> = { Normal: 1, Special: 2, ThemeSong: 3 }
        const typeA = typeOrder[a.AniDB?.Type || a.Type || 'Normal'] || 4
        const typeB = typeOrder[b.AniDB?.Type || b.Type || 'Normal'] || 4
        if (typeA !== typeB) return typeA - typeB

        const numA = a.AniDB?.EpisodeNumber ?? a.Number ?? a.EpisodeNumber ?? 0
        const numB = b.AniDB?.EpisodeNumber ?? b.Number ?? b.EpisodeNumber ?? 0
        return numA - numB
      })

      let opCount = 0
      let edCount = 0
      let otherTsCount = 0

      for (const ep of sorted) {
        const hasFiles = ep.Files && ep.Files.length > 0
        if (!hasFiles) continue

        const epType = ep.AniDB?.Type || ep.Type || 'Normal'
        const baseNum = ep.AniDB?.EpisodeNumber ?? ep.Number ?? ep.EpisodeNumber ?? 1
        const epNameLower = (ep.Name || ep.AniDB?.Title || '').toLowerCase()

        let epNumStr = ''
        let isTheme = false

        const isThemeType =
          epType === 'Credits' ||
          epType === 'ThemeSong' ||
          epNameLower === 'opening' ||
          epNameLower === 'ending' ||
          epNameLower.startsWith('op ') ||
          epNameLower.startsWith('ed ')

        if (isThemeType) {
          isTheme = true
          if (epNameLower.includes('ending') || epNameLower.includes('ed')) {
            edCount++
            epNumStr = `ED${edCount}`
          } else if (epNameLower.includes('opening') || epNameLower.includes('op')) {
            opCount++
            epNumStr = `OP${opCount}`
          } else {
            otherTsCount++
            epNumStr = `TS${otherTsCount}`
          }
        } else if (epType === 'Special') {
          epNumStr = `SP${baseNum}`
        } else if (epType === 'Trailer' || epType === 'Parody' || epType === 'Other') {
          continue
        } else {
          epNumStr = baseNum.toString()
        }

        const thumb = ep.Images?.Thumbnails?.[0]
        const thumbUrl = thumb?.ID
          ? `/api/shoko/image/${thumb.Source || 'Shoko'}/${thumb.Type || 'Thumbnail'}/${thumb.ID}`
          : undefined
        const fileId = ep.Files?.[0]?.ID

        if (isTheme) {
          if (!themeSongs.includes(epNumStr)) {
            themeSongs.push(epNumStr)
            episodeDetails.push({
              number: epNumStr,
              title: ep.Name || ep.AniDB?.Title || `Theme Song ${epNumStr}`,
              thumbnail: thumbUrl,
              isLocal: true,
              watched: Boolean(ep.UserData?.Watched),
              fileId,
              type: 'ThemeSong',
            })
          }
        } else {
          if (!seenEpisodes.has(epNumStr)) {
            seenEpisodes.add(epNumStr)
            episodeNumbers.push(epNumStr)
            episodeDetails.push({
              number: epNumStr,
              title: ep.Name || ep.AniDB?.Title || `Episode ${epNumStr}`,
              thumbnail: thumbUrl,
              isLocal: true,
              watched: Boolean(ep.UserData?.Watched),
              fileId,
              type: epType === 'Special' ? 'Special' : 'Normal',
            })
          }
        }
      }

      return {
        episodes: episodeNumbers,
        themeSongs: themeSongs.length > 0 ? themeSongs : undefined,
        description: '',
        availableEpisodesDetail: episodeDetails,
      }
    } catch (err) {
      log.error({ err, showId }, 'Failed to get Shoko episodes')
      return null
    }
  }

  public async getStreamUrls(
    showId: string,
    episodeNumber: string,
    _mode?: 'sub' | 'dub'
  ): Promise<VideoSource[] | null> {
    try {
      const numericSeriesId = await this.extractSeriesId(showId)
      if (!numericSeriesId) return null

      const episodes = await shokoClient.getSeriesEpisodes(numericSeriesId)
      const cleanNum = episodeNumber.trim().toUpperCase()

      // Sort episodes to match the numbering scheme used in getEpisodes
      const sorted = [...episodes].sort((a, b) => {
        const typeOrder: Record<string, number> = { Normal: 1, Special: 2, ThemeSong: 3 }
        const typeA = typeOrder[a.AniDB?.Type || a.Type || 'Normal'] || 4
        const typeB = typeOrder[b.AniDB?.Type || b.Type || 'Normal'] || 4
        if (typeA !== typeB) return typeA - typeB

        const numA = a.AniDB?.EpisodeNumber ?? a.Number ?? a.EpisodeNumber ?? 0
        const numB = b.AniDB?.EpisodeNumber ?? b.Number ?? b.EpisodeNumber ?? 0
        return numA - numB
      })

      let opCount = 0
      let edCount = 0
      let otherTsCount = 0

      const ep = sorted.find((e) => {
        const epType = e.AniDB?.Type || e.Type || 'Normal'
        const baseNum = e.AniDB?.EpisodeNumber ?? e.Number ?? e.EpisodeNumber ?? 1
        const epNameLower = (e.Name || e.AniDB?.Title || '').toLowerCase()

        const isThemeType =
          epType === 'Credits' ||
          epType === 'ThemeSong' ||
          epNameLower === 'opening' ||
          epNameLower === 'ending' ||
          epNameLower.startsWith('op ') ||
          epNameLower.startsWith('ed ')

        let identifier = ''
        if (isThemeType) {
          if (epNameLower.includes('ending') || epNameLower.includes('ed')) {
            edCount++
            identifier = `ED${edCount}`
          } else if (epNameLower.includes('opening') || epNameLower.includes('op')) {
            opCount++
            identifier = `OP${opCount}`
          } else {
            otherTsCount++
            identifier = `TS${otherTsCount}`
          }
        } else if (epType === 'Special') {
          identifier = `SP${baseNum}`
        } else {
          identifier = baseNum.toString()
        }

        return identifier.toUpperCase() === cleanNum
      })

      if (!ep || !ep.Files || ep.Files.length === 0) {
        log.warn({ showId, episodeNumber }, 'No local file found in Shoko for episode')
        return null
      }

      const file = ep.Files[0]
      const fileId = file.ID

      // Parse audio tracks from Shoko v5 MediaInfo (supports both Audio array and MediaStreams.Audio)
      const audioStreams: any[] = file.MediaInfo?.Audio || (file.MediaInfo as any)?.MediaStreams?.Audio || []
      const audioTracks: AudioTrack[] = audioStreams.map((a: any, idx: number) => {
        const lang = a.Language || a.LanguageCode || 'Unknown'
        const rawCodec = typeof a.Codec === 'object' ? a.Codec?.Simplified || a.Codec?.Raw : a.Codec
        const codec = rawCodec || 'AAC'
        const channels = a.Channels ? (a.Channels === 6 ? '5.1' : `${a.Channels}.0`) : '2.0'
        const label = a.Title ? `${a.Title} (${lang} ${codec} ${channels})` : `${lang} [${codec} ${channels}]`

        return {
          index: idx, // 0-based relative audio stream index for FFmpeg (-map 0:a:${idx})
          language: lang,
          label,
          codec: (typeof codec === 'string' ? codec : 'aac').toLowerCase(),
          channels: a.Channels || 2,
          isDefault: Boolean(a.Default || a.IsDefault || idx === 0),
        }
      })

      // Parse subtitle tracks from Shoko v5 MediaInfo (supports both Subtitles array and MediaStreams.Subtitles)
      const subtitleStreams: any[] = file.MediaInfo?.Subtitles || (file.MediaInfo as any)?.MediaStreams?.Subtitles || []
      const subtitles: SubtitleTrack[] = subtitleStreams.map((s: any, idx: number) => {
        const lang = s.Language || s.LanguageCode || 'Unknown'
        const code = s.LanguageCode || (lang.toLowerCase().startsWith('en') ? 'en' : lang.toLowerCase())
        const label = s.Title ? `${s.Title} (${lang})` : `${lang} Subtitle ${idx + 1}`
        const rawFormat = typeof s.Format === 'object' ? s.Format?.Name : s.Format
        const format = (rawFormat || (typeof s.Codec === 'object' ? s.Codec?.Simplified : s.Codec) || 'webvtt').toLowerCase()

        return {
          lang: code,
          language: lang,
          label,
          url: `/api/local-media/subtitle/${fileId}/${idx}`,
          src: `/api/local-media/subtitle/${fileId}/${idx}`,
          format,
        }
      })

      // Construct video source
      const streamUrl = `/api/local-media/stream/${fileId}`
      const videoSource: VideoSource = {
        sourceName: 'Shoko (Local)',
        type: 'player',
        actualEpisodeNumber: cleanNum,
        isLocal: true,
        links: [
          {
            resolutionStr: 'Original (Local)',
            link: streamUrl,
            hls: false,
          },
        ],
        audioTracks: audioTracks.length > 0 ? audioTracks : undefined,
        subtitles: subtitles.length > 0 ? subtitles : undefined,
      }

      return [videoSource]
    } catch (err) {
      log.error({ err, showId, episodeNumber }, 'Failed to get Shoko stream URLs')
      return null
    }
  }

  private async extractSeriesId(showId: string): Promise<number | null> {
    if (showId.startsWith('shoko:')) {
      return parseInt(showId.replace('shoko:', ''), 10) || null
    }

    if (/^\d+$/.test(showId)) {
      const anilistId = parseInt(showId, 10)
      const anidbId = animeIdMapper.getAnidbIdByAnilist(anilistId)
      if (anidbId) {
        const series = await shokoClient.getSeriesByAnidbId(anidbId)
        if (series?.IDs?.ID) return series.IDs.ID
      }

      // If numeric ID matches a Shoko series ID directly
      const byId = await shokoClient.getSeriesById(anilistId)
      if (byId?.IDs?.ID) return byId.IDs.ID
    }

    return null
  }

  private seriesToShow(series: ShokoSeries): Show {
    const preferredPoster =
      series.Images?.Posters?.find((p) => p.Preferred) ||
      series.Images?.Posters?.[0]

    const preferredBackdrop =
      series.Images?.Backdrops?.find((b) => b.Preferred) ||
      series.Images?.Backdrops?.[0] ||
      series.Images?.Banners?.find((b) => b.Preferred) ||
      series.Images?.Banners?.[0]

    const posterUrl = preferredPoster?.ID
      ? `/api/shoko/image/${preferredPoster.Source || 'AniDB'}/${preferredPoster.Type || 'Poster'}/${preferredPoster.ID}`
      : undefined

    const bannerUrl = preferredBackdrop?.ID
      ? `/api/shoko/image/${preferredBackdrop.Source || 'TMDB'}/${preferredBackdrop.Type || 'Backdrop'}/${preferredBackdrop.ID}`
      : undefined

    const anidbId = series.IDs?.AniDB || series.AniDB?.ID
    const anilistId = anidbId ? animeIdMapper.getAnilistIdByAnidb(anidbId) : null

    return {
      _id: `shoko:${series.IDs.ID}`,
      id: anilistId ? anilistId.toString() : `shoko:${series.IDs.ID}`,
      anilistId: anilistId ?? undefined,
      name: series.Name || series.AniDB?.Title || 'Unknown Anime',
      englishName: series.AniDB?.Title || series.Name,
      thumbnail: posterUrl,
      bannerImage: bannerUrl,
      description: series.AniDB?.Description,
      episodeCount: series.Sizes?.Local?.Normal ?? series.AniDB?.EpisodeCount ?? 0,
      type: series.AniDB?.Type || 'TV',
    }
  }
}

export const shokoProvider = new ShokoProvider()
