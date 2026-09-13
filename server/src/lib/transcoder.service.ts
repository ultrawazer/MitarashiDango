import { spawn, spawnSync, ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import { CONFIG } from '../config'
import logger from '../logger'

const log = logger.child({ module: 'TranscoderService' })

export type HwAccelMode = 'auto' | 'vaapi' | 'nvenc' | 'software'

export class TranscoderService {
  private hasFfmpeg = false
  private ffmpegPath = 'ffmpeg'
  private detectedHwAccel: HwAccelMode = 'software'
  private nvencVerified = false

  constructor() {
    this.detectCapabilities()
  }

  private detectCapabilities(): void {
    // 1. Try system FFmpeg first
    try {
      const check = spawnSync('ffmpeg', ['-version'], { encoding: 'utf-8', timeout: 3000 })
      if (!check.error && check.status === 0) {
        this.hasFfmpeg = true
        this.ffmpegPath = 'ffmpeg'
        log.info('FFmpeg detected on system PATH')
      }
    } catch {
      // system ffmpeg not found
    }

    // 2. Fallback to ffmpeg-static npm package (for Windows/macOS dev environments)
    if (!this.hasFfmpeg) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ffmpegStaticPath = require('ffmpeg-static') as string
        if (ffmpegStaticPath && fs.existsSync(ffmpegStaticPath)) {
          const check = spawnSync(ffmpegStaticPath, ['-version'], { encoding: 'utf-8', timeout: 3000 })
          if (!check.error && check.status === 0) {
            this.hasFfmpeg = true
            this.ffmpegPath = ffmpegStaticPath
            log.info({ path: ffmpegStaticPath }, 'FFmpeg detected via ffmpeg-static package')
          }
        }
      } catch {
        // ffmpeg-static not installed, that's fine
      }
    }

    if (!this.hasFfmpeg) {
      log.warn('FFmpeg is NOT detected. Streaming will rely on direct container playback.')
    } else {
      // Detect hardware acceleration
      const envMode = (process.env.HW_ACCEL as HwAccelMode) || 'auto'

      if (envMode === 'software') {
        this.detectedHwAccel = 'software'
        log.info('Hardware acceleration: Forced software encoding via HW_ACCEL')
      } else if (envMode === 'nvenc' || (envMode === 'auto' && (process.env.NVIDIA_VISIBLE_DEVICES || fs.existsSync('/proc/driver/nvidia')))) {
        // Verify NVENC actually works before committing
        this.detectedHwAccel = 'nvenc'
        try {
          const nvencCheck = spawnSync(
            this.ffmpegPath,
            ['-hide_banner', '-f', 'lavfi', '-i', 'nullsrc=s=16x16:d=0.1', '-c:v', 'h264_nvenc', '-f', 'null', '-'],
            { encoding: 'utf-8', timeout: 5000 }
          )
          if (!nvencCheck.error && nvencCheck.status === 0) {
            this.nvencVerified = true
            log.info('Hardware acceleration: NVIDIA NVENC verified and enabled')
          } else {
            this.nvencVerified = false
            log.warn('NVIDIA NVENC detected but verification failed, will use stream-copy fallback')
          }
        } catch {
          this.nvencVerified = false
          log.warn('NVIDIA NVENC verification threw, will use stream-copy fallback')
        }
      } else if (envMode === 'vaapi' || (envMode === 'auto' && process.platform === 'linux' && fs.existsSync('/dev/dri'))) {
        this.detectedHwAccel = 'vaapi'
        log.info('Hardware acceleration: Intel/AMD VAAPI (/dev/dri) enabled')
      } else {
        this.detectedHwAccel = 'software'
        log.info('Hardware acceleration: Software encoding')
      }
    }

    try {
      if (!fs.existsSync(CONFIG.TRANSCODE_DIR)) {
        fs.mkdirSync(CONFIG.TRANSCODE_DIR, { recursive: true })
      }
    } catch (e) {
      log.warn({ err: e }, 'Failed to create transcode directory')
    }
  }

  public getCapabilities(): {
    hasFfmpeg: boolean
    detectedHwAccel: HwAccelMode
    transcodeDir: string
  } {
    return {
      hasFfmpeg: this.hasFfmpeg,
      detectedHwAccel: this.detectedHwAccel,
      transcodeDir: CONFIG.TRANSCODE_DIR,
    }
  }

  /**
   * Spawns an FFmpeg process to stream-remux or transcode a video stream into fragmented MP4 (fMP4)
   * which is instantly streamable in HTML5 <video> without waiting for full transcode.
   */
  public streamRemux(options: {
    inputUrl: string
    audioIndex?: number
    transcodeVideo?: boolean
    hwAccel?: HwAccelMode
    startTime?: number
  }): { process: ChildProcess; stdout: NodeJS.ReadableStream } | null {
    if (!this.hasFfmpeg) return null

    const mode = options.hwAccel && options.hwAccel !== 'auto' ? options.hwAccel : this.detectedHwAccel
    const args: string[] = ['-hide_banner', '-loglevel', 'error']

    // Probe limits: cap input analysis to 5MB/5s for fast startup
    args.push('-probesize', '5000000', '-analyzeduration', '5000000')

    // Fast seek if startTime specified
    if (options.startTime && options.startTime > 0) {
      args.push('-ss', options.startTime.toString())
    }

    // Input URL (Shoko VFS HTTP stream or local file path)
    args.push('-i', options.inputUrl)

    // Map video stream 0
    args.push('-map', '0:v:0')

    // Map specific audio track or default
    if (options.audioIndex !== undefined && options.audioIndex >= 0) {
      args.push('-map', `0:a:${options.audioIndex}?`)
    } else {
      args.push('-map', '0:a:0?')
    }

    // Video codec handling
    if (options.transcodeVideo) {
      if (mode === 'vaapi' && (fs.existsSync('/dev/dri/renderD128') || fs.existsSync('/dev/dri'))) {
        const driNode = fs.existsSync('/dev/dri/renderD128') ? '/dev/dri/renderD128' : '/dev/dri'
        args.push(
          '-vaapi_device',
          driNode,
          '-vf',
          'format=nv12,hwupload',
          '-c:v',
          'h264_vaapi',
          '-b:v',
          '5M'
        )
      } else if (mode === 'nvenc' && this.nvencVerified) {
        args.push('-c:v', 'h264_nvenc', '-preset', 'p4', '-b:v', '5M')
      } else if (mode === 'nvenc' && !this.nvencVerified) {
        // NVENC detected but not verified — fall back to stream-copy
        // (video is almost certainly H.264/HEVC which browsers can play)
        log.info('NVENC not verified, falling back to video stream-copy')
        args.push('-c:v', 'copy')
      } else {
        args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22')
      }
    } else {
      // 0% CPU stream copy remux!
      args.push('-c:v', 'copy')
    }

    // Audio codec: AAC is universal for web browsers
    args.push('-c:a', 'aac', '-b:a', '192k', '-ac', '2')

    // Fragmented MP4 for live streaming to HTML5 video element
    args.push(
      '-movflags',
      'frag_keyframe+empty_moov+default_base_moof',
      '-f',
      'mp4',
      'pipe:1'
    )

    log.info({ args: args.join(' ') }, 'Spawning FFmpeg stream process')

    const proc = spawn(this.ffmpegPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    proc.stderr?.on('data', (data) => {
      const line = data.toString()
      if (line.includes('Error') || line.includes('Invalid')) {
        log.warn({ ffmpeg: line.trim() }, 'FFmpeg error stream')
      }
    })

    proc.on('error', (err) => {
      log.error({ err }, 'FFmpeg process failed to spawn')
    })

    return { process: proc, stdout: proc.stdout! }
  }

  /**
   * Extracts a subtitle track from the video file/stream and outputs it as WebVTT.
   */
  public extractSubtitle(
    inputUrl: string,
    subtitleIndex: number
  ): NodeJS.ReadableStream | null {
    if (!this.hasFfmpeg) return null

    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-probesize',
      '5000000',
      '-analyzeduration',
      '5000000',
      '-i',
      inputUrl,
      '-map',
      `0:s:${subtitleIndex}`,
      '-f',
      'webvtt',
      'pipe:1',
    ]

    const proc = spawn(this.ffmpegPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    return proc.stdout
  }
}

export const transcoderService = new TranscoderService()
