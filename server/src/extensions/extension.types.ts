export type ExtensionType = 'anime' | 'tv' | 'asmr'

export interface ExtensionMetadata {
  id: string
  name: string
  version: string
  type: ExtensionType
  lang: string
  mature: boolean
  description?: string
  icon?: string
  author?: string
  authUrl?: string
}

export interface Show {
  _id: string
  id?: string
  session?: string
  anilistId?: number
  name: string
  names?: {
    romaji?: string
    english?: string
    native?: string
    synonyms?: string[]
  }
  nativeName?: string
  englishName?: string
  thumbnail?: string
  thumbnails?: string[]
  bannerImage?: string
  description?: string
  type?: string
  episodeNumber?: number
  availableEpisodesDetail?: {
    sub?: string[]
    dub?: string[]
    raw?: string[]
  }
  availableEpisodes?: {
    sub?: number
    dub?: number
    raw?: number
  }
  episodeCount?: string | number | null
  episodeDuration?: string | number | null
  averageScore?: number | null
  score?: number | null
  year?: number | null
  isAdult?: boolean
  rating?: string
  genres?: { name: string }[]
  tags?: { name: string }[]
  studios?: { name: string }[]
  status?: string
  airedStart?: Record<string, unknown> | null
  airedEnd?: Record<string, unknown> | null
  country?: string | null
  season?: Record<string, unknown> | null
  nextAiring?: {
    episode: number
    timeUntilAiring: number
  }
  nextEpisodeAirDate?: string
  airTime?: string
  aired?: boolean
}

export interface VideoLink {
  resolutionStr: string
  link: string
  hls: boolean
  headers?: Record<string, string>
}

export interface AudioTrack {
  index?: number
  language: string
  label: string
  codec?: string
  channels?: number
  isDefault?: boolean
}

export interface SubtitleTrack {
  lang?: string
  language: string
  label: string
  url: string
  src?: string
  format?: string
}

export interface VideoSource {
  sourceName: string
  links: VideoLink[]
  subtitles?: SubtitleTrack[]
  audioTracks?: AudioTrack[]
  isLocal?: boolean
  type?: 'player' | 'iframe'
  actualEpisodeNumber?: string
  iframeUrl?: string
  duration?: number
}

export interface EpisodeDetail {
  number: string
  title?: string
  thumbnail?: string
  isLocal?: boolean
  watched?: boolean
  fileId?: number
  type?: string
}

export interface EpisodeDetails {
  episodes: string[]
  themeSongs?: string[]
  description: string
  availableEpisodesDetail?: EpisodeDetail[]
}

export interface SearchOptions {
  query?: string
  page?: number
  sort?: string
  rating?: string
}

export interface ExtensionContext {
  ua?: string
  cookie?: string
  headers?: Record<string, string>
  [key: string]: any
}

export interface IExtension {
  readonly metadata: ExtensionMetadata
}

export interface AnimeExtension extends IExtension {
  name: string
  search(options: SearchOptions, context?: ExtensionContext): Promise<Show[]>
  getEpisodes(
    showId: string,
    mode?: 'sub' | 'dub',
    ua?: string,
    cookie?: string,
    context?: ExtensionContext
  ): Promise<EpisodeDetails | null>
  getStreamUrls(
    showId: string,
    episodeNumber: string,
    mode?: 'sub' | 'dub',
    context?: ExtensionContext
  ): Promise<VideoSource[] | null>
  resolveShowId?(
    title: string,
    romaji?: string,
    mode?: 'sub' | 'dub',
    context?: ExtensionContext
  ): Promise<string | null>
}

export interface TvStreamOptions {
  mediaType: 'movie' | 'tv'
  tmdbId: number
  season?: number
  episode?: number
  title?: string
  year?: string
  imdbId?: string
  server?: string
  totalSeasons?: number
}

export interface TvStreamResult {
  server?: string
  sources: VideoSource[]
  audioTracks?: AudioTrack[]
  subtitles?: SubtitleTrack[]
  iframeUrl?: string
  error?: string
}

export interface TvExtension extends IExtension {
  getStreamUrls(options: TvStreamOptions, context?: ExtensionContext): Promise<TvStreamResult | null>
}

export interface AsmrBrowseOptions {
  query?: string
  page?: number
  sort?: string
  rating?: string
}

export interface AsmrExtension extends IExtension {
  browse(options: AsmrBrowseOptions, context?: ExtensionContext): Promise<{ shows: Show[]; hasNext: boolean }>
  getEpisodes(rjCode: string, context?: ExtensionContext): Promise<EpisodeDetails | null>
  getStreamUrls(rjCode: string, episodeNumber?: string, context?: ExtensionContext): Promise<VideoSource[] | null>
  getImages?(rjCode: string, context?: ExtensionContext): Promise<string[]>
  getChapters?(rjCode: string, context?: ExtensionContext): Promise<unknown[]>
}

export interface ExtensionRepository {
  id: string
  name: string
  url: string
  enabled: boolean
  isDefault?: boolean
}

export interface InstalledExtensionRecord {
  id: string
  metadata: ExtensionMetadata
  enabled: boolean
  isBuiltin?: boolean
  pkg: string
  installedAt: string
}

