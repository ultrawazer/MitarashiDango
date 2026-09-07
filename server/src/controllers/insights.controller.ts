import { Request, Response } from 'express'
import logger from '../logger'
import { InsightsRepository } from '../repositories/insights.repository'
import { SettingsRepository } from '../repositories/settings.repository'

interface CoreStats {
  totalSeconds?: number
  totalEpisodes?: number
  totalAnime: number
  completedCount: number
  totalWatchlist: number
}

interface ActivityDay {
  day: string
  count: number
}

interface HourlyStat {
  hour: string
  count: number
}

interface SeasonalStat {
  month: string
  seconds: number
}

interface WatchedShowMeta {
  id: string
  genres: string
  popularityScore: number
}

interface DroppedShow {
  id: string
  name: string
  lastActivity: string
}

interface CompletionVelocity {
  daysToFinish: number
}

interface TopShow {
  id: string
  name: string
  nativeName?: string
  englishName?: string
  thumbnail: string
}

interface GenreCard {
  rank: number
  name: string
  count: number
  titleCount: number
  episodeCount: number
  meanScore: number
  timeWatched: string
  topShows: TopShow[]
}

interface WatchedEpisodeWithMeta {
  showId: string
  currentTime: number
  duration: number
  episodeCount?: number
  genres: string
  popularityScore: number
  name: string
  nativeName?: string
  englishName?: string
  thumbnail: string
}

export class InsightsController {
  getWatchInsights = async (req: Request, res: Response) => {
    const db = req.db
    const settingRow = await SettingsRepository.getByKey(db, 'insights_include_watchlist')
    const includeWatchlist = settingRow?.value === 'true'

    const [
      core,
      activityGrid,
      hourlyDist,
      seasonality,
      allWatches,
      watchedShows,
      droppedWarning,
      velocities,
    ] = (await Promise.all([
      includeWatchlist
        ? InsightsRepository.getComprehensiveCoreStats(db)
        : InsightsRepository.getCoreStats(db),
      includeWatchlist
        ? InsightsRepository.getComprehensiveActivityGrid(db)
        : InsightsRepository.getActivityGrid(db),
      InsightsRepository.getHourlyDist(db),
      InsightsRepository.getSeasonality(db),
      InsightsRepository.getAllWatches(db),
      includeWatchlist
        ? InsightsRepository.getComprehensiveShowsMeta(db)
        : InsightsRepository.getWatchedShowsMeta(db),
      InsightsRepository.getDroppedShows(db),
      includeWatchlist
        ? InsightsRepository.getComprehensiveVelocities(db)
        : InsightsRepository.getCompletionVelocities(db),
    ])) as [
      CoreStats,
      ActivityDay[],
      HourlyStat[],
      SeasonalStat[],
      { watchedAt: string; currentTime: number }[],
      WatchedShowMeta[],
      DroppedShow[],
      CompletionVelocity[],
    ]

    const bingeFactor = activityGrid.length > 0 ? Math.max(...activityGrid.map((a) => a.count)) : 0

    const sessions: number[] = []
    if (allWatches.length > 0) {
      let currentSessionSeconds = allWatches[0].currentTime
      for (let i = 1; i < allWatches.length; i++) {
        const prev = new Date(allWatches[i - 1].watchedAt).getTime()
        const curr = new Date(allWatches[i].watchedAt).getTime()
        if (curr - prev < 3600000) {
          currentSessionSeconds += allWatches[i].currentTime
        } else {
          sessions.push(currentSessionSeconds)
          currentSessionSeconds = allWatches[i].currentTime
        }
      }
      sessions.push(currentSessionSeconds)
    }
    const avgSessionMinutes =
      sessions.length > 0
        ? Math.round(sessions.reduce((a, b) => a + b, 0) / sessions.length / 60)
        : 0

    const genreCounts: Record<string, number> = {}
    let totalPopScore = 0
    let popCount = 0

    for (const show of watchedShows) {
      let genres: string[] = []
      if (show.genres) {
        try {
          if (show.genres.startsWith('[')) {
            genres = JSON.parse(show.genres)
          } else {
            genres = show.genres.split(',').map((g: string) => g.trim())
          }
        } catch (e) {
          logger.warn({ err: e, showId: show.id }, 'Failed to parse genres for insights')
        }
      }

      for (const g of genres) {
        genreCounts[g] = (genreCounts[g] || 0) + 1
      }

      if (show.popularityScore) {
        totalPopScore += show.popularityScore
        popCount++
      }
    }

    const topGenre = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
    const personaMap: Record<string, string> = {
      Action: 'Shonen Warrior',
      Romance: 'Hopeless Romantic',
      Comedy: 'Chaos Enjoyer',
      'Slice of Life': 'Vibe Seeker',
      Horror: 'Fearless Watcher',
      Fantasy: 'Isekai Traveller',
      'Sci-Fi': 'Future Scientist',
      Drama: 'Feels Collector',
    }
    const persona = personaMap[topGenre || ''] || 'Anime Enthusiast'

    const avgCompletionDays =
      velocities.length > 0
        ? Math.round(velocities.reduce((a, b) => a + b.daysToFinish, 0) / velocities.length)
        : 0

    res.json({
      totalHours: Math.round((core?.totalSeconds || 0) / 3600),
      totalEpisodes: core?.totalEpisodes || 0,
      totalAnime: core?.totalAnime || 0,
      completedAnime: core?.completedCount || 0,
      completionRate:
        core?.totalWatchlist > 0
          ? Math.round((core.completedCount / core.totalWatchlist) * 100)
          : 0,
      persona,
      bingeFactor,
      avgSessionMinutes,
      avgCompletionDays,
      popularityScore: popCount > 0 ? Math.round(totalPopScore / popCount) : 0,
      genreSplit:
        Object.entries(genreCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 8) || [],
      activityGrid: activityGrid || [],
      hourlyDist:
        Array.from({ length: 24 }, (_, i) => {
          const hour = i.toString().padStart(2, '0')
          return { hour, count: hourlyDist?.find((d) => d.hour === hour)?.count || 0 }
        }) || [],
      seasonality:
        Array.from({ length: 12 }, (_, i) => {
          const month = (i + 1).toString().padStart(2, '0')
          return {
            month,
            seconds: seasonality?.find((s) => s.month === month)?.seconds || 0,
          }
        }) || [],
      droppedShows: (droppedWarning || []).slice(0, 5),
      includeWatchlist: Boolean(includeWatchlist),
    })
  }

  private formatTime(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const days = Math.floor(hours / 24)
    const remHours = hours % 24

    if (days > 0) {
      return `${days}d ${remHours}h`
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    return `${minutes}m`
  }

  getGenreCards = async (req: Request, res: Response) => {
    const db = req.db
    const settingRow = await SettingsRepository.getByKey(db, 'insights_include_watchlist')
    const includeWatchlist = settingRow?.value === 'true'

    const rows: WatchedEpisodeWithMeta[] = includeWatchlist
      ? await InsightsRepository.getComprehensiveEpisodesWithMeta(db)
      : await InsightsRepository.getWatchedEpisodesWithMeta(db)

    const genreData: Record<
      string,
      {
        totalEpisodes: number
        totalTime: number
        scores: number[]
        showWatches: Record<string, number>
        showMeta: Record<
          string,
          { name: string; nativeName?: string; englishName?: string; thumbnail: string }
        >
      }
    > = {}

    for (const row of rows) {
      let genres: string[] = []
      if (row.genres) {
        try {
          if (row.genres.startsWith('[')) {
            genres = JSON.parse(row.genres)
          } else {
            genres = row.genres.split(',').map((g: string) => g.trim())
          }
        } catch (e) {
          logger.warn({ err: e, showId: row.showId }, 'Failed to parse genres for genre cards')
        }
      }

      const timeWatched = (row.currentTime || 0) + (row.duration || 0)
      let score = row.popularityScore || 0
      if (score > 10) score = score / 10
      const epCount = row.episodeCount || 1

      for (const genre of genres) {
        if (!genreData[genre]) {
          genreData[genre] = {
            totalEpisodes: 0,
            totalTime: 0,
            scores: [],
            showWatches: {},
            showMeta: {},
          }
        }
        genreData[genre].totalEpisodes += epCount
        genreData[genre].totalTime += timeWatched
        if (score > 0) genreData[genre].scores.push(score)
        genreData[genre].showWatches[row.showId] =
          (genreData[genre].showWatches[row.showId] || 0) + epCount
        if (row.name && row.thumbnail) {
          genreData[genre].showMeta[row.showId] = {
            name: row.name,
            nativeName: row.nativeName,
            englishName: row.englishName,
            thumbnail: row.thumbnail,
          }
        }
      }
    }

    const genreCards: GenreCard[] = Object.entries(genreData).map(([name, data]) => {
      const topShows = Object.entries(data.showWatches)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([showId]) => ({
          id: showId,
          name: data.showMeta[showId]?.name || '',
          nativeName: data.showMeta[showId]?.nativeName,
          englishName: data.showMeta[showId]?.englishName,
          thumbnail: data.showMeta[showId]?.thumbnail || '',
        }))

      const titleCount = Object.keys(data.showWatches).length

      return {
        rank: 0,
        name,
        count: titleCount,
        titleCount,
        episodeCount: data.totalEpisodes,
        meanScore:
          data.scores.length > 0 ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length : 0,
        timeWatched: this.formatTime(data.totalTime),
        topShows,
      }
    })

    genreCards.sort((a, b) => b.episodeCount - a.episodeCount)
    genreCards.forEach((card, i) => {
      card.rank = i + 1
    })

    res.json(genreCards)
  }

  getActivityDayDetails = async (req: Request, res: Response) => {
    const db = req.db
    const date = req.query.date as string
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'Invalid or missing date parameter (expected YYYY-MM-DD)' })
      return
    }

    const settingRow = await SettingsRepository.getByKey(db, 'insights_include_watchlist')
    const includeWatchlist = settingRow?.value === 'true'

    const { streamed, completed, started } = await InsightsRepository.getActivityForDate(
      db,
      date,
      includeWatchlist
    )

    // Consolidate shows by showId
    const showMap = new Map<
      string,
      {
        id: string
        name: string
        nativeName?: string
        englishName?: string
        thumbnail: string
        status?: string
        score?: number
        watchedEpisodes?: number
        totalEpisodes?: number
        badges: string[]
        episodesStreamed?: number
      }
    >()

    for (const item of streamed) {
      const existing = showMap.get(item.showId) || {
        id: item.showId,
        name: item.name,
        nativeName: item.nativeName,
        englishName: item.englishName,
        thumbnail: item.thumbnail,
        status: item.status,
        score: item.score,
        totalEpisodes: item.episodeCount,
        badges: [] as string[],
      }
      existing.episodesStreamed = (existing.episodesStreamed || 0) + item.episodesStreamed
      const epLabel =
        item.episodesStreamed === 1
          ? '1 episode streamed'
          : `${item.episodesStreamed} episodes streamed`
      if (!existing.badges.includes(epLabel)) {
        existing.badges.push(epLabel)
      }
      showMap.set(item.showId, existing)
    }

    for (const item of completed) {
      const existing = showMap.get(item.showId) || {
        id: item.showId,
        name: item.name,
        nativeName: item.nativeName,
        englishName: item.englishName,
        thumbnail: item.thumbnail,
        status: item.status,
        score: item.score,
        watchedEpisodes: item.watchedEpisodes,
        totalEpisodes: item.totalEpisodes,
        badges: [] as string[],
      }
      if (!existing.badges.includes('Completed')) {
        existing.badges.push('Completed')
      }
      if (item.score && !existing.score) existing.score = item.score
      if (item.watchedEpisodes && !existing.watchedEpisodes)
        existing.watchedEpisodes = item.watchedEpisodes
      showMap.set(item.showId, existing)
    }

    for (const item of started) {
      const existing = showMap.get(item.showId) || {
        id: item.showId,
        name: item.name,
        nativeName: item.nativeName,
        englishName: item.englishName,
        thumbnail: item.thumbnail,
        status: item.status,
        score: item.score,
        watchedEpisodes: item.watchedEpisodes,
        totalEpisodes: item.totalEpisodes,
        badges: [] as string[],
      }
      if (!existing.badges.includes('Started')) {
        existing.badges.push('Started')
      }
      showMap.set(item.showId, existing)
    }

    const shows = Array.from(showMap.values())
    const totalEpisodes = shows.reduce((sum, s) => sum + (s.episodesStreamed || 0), 0)

    res.json({
      date,
      totalAnime: shows.length,
      totalEpisodes,
      shows,
    })
  }

  getGenreShows = async (req: Request, res: Response) => {
    const db = req.db
    const genre = req.query.genre as string
    if (!genre) {
      res.status(400).json({ error: 'Missing genre parameter' })
      return
    }

    const rows = await InsightsRepository.getShowsForGenre(db, genre)

    // Filter to ensure exact match on genre in JSON array
    const filtered = rows.filter((row) => {
      if (!row.genres) return false
      try {
        if (row.genres.startsWith('[')) {
          const parsed = JSON.parse(row.genres) as string[]
          return parsed.some((g) => g.toLowerCase() === genre.toLowerCase())
        }
        return row.genres
          .split(',')
          .map((g) => g.trim().toLowerCase())
          .includes(genre.toLowerCase())
      } catch {
        return false
      }
    })

    res.json({
      genre,
      total: filtered.length,
      shows: filtered.map((row) => ({
        id: row.id,
        name: row.name,
        nativeName: row.nativeName,
        englishName: row.englishName,
        thumbnail: row.thumbnail,
        status: row.status,
        score: row.score,
        watchedEpisodes: row.watchedEpisodes,
        totalEpisodes: row.totalEpisodes,
        type: row.type,
      })),
    })
  }
}
