import { spawn, spawnSync, ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import { CONFIG } from '../config'
import logger from '../logger'

const log = logger.child({ module: 'TranscoderService' })

export type HwAccelMode = 'auto' | 'vaapi' | 'nvenc' | 'software'

export class TranscoderService {
  private hasFfmpeg = false
  private detectedHwAccel: HwAccelMode = 'software'

  constructor() {
    this.detectCapabilities()
  }

  private detectCapabilities(): void {
    try {
      const check = spawnSync('ffmpeg', ['-version'], { encoding: 'utf-8', timeout: 3000 })
      if (!check.error && check.status === 0) {
        this.hasFfmpeg = true
        log.info('FFmpeg is detected on the host system')

        // Check Intel VAAPI
        if (process.platform === 'linux' && fs.existsSync('/dev/dri')) {
          this.detectedHwAccel = 'vaapi'
          log.info('Hardware acceleration: Intel VAAPI (/dev/dri) detected')
        } else if (process.env.NVIDIA_VISIBLE_DEVICES || fs.existsSync('/proc/driver/nvidia')) {
          this.detectedHwAccel = 'nvenc'
          log.info('Hardware acceleration: NVIDIA NVENC detected')
        } else {
          this.detectedHwAccel = 'software'
          log.info('Hardware acceleration: Software encoding')
        }
      } else {
        this.hasFfmpeg = false
        log.warn('FFmpeg is NOT detected in PATH. Streaming will rely on direct container playback.')
      }
    } catch {
      this.hasFfmpeg = false
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
      if (mode === 'vaapi' && fs.existsSync('/dev/dri/renderD128')) {
        args.push(
          '-vaapi_device',
          '/dev/dri/renderD128',
          '-vf',
          'format=nv12,hwupload',
          '-c:v',
          'h264_vaapi',
          '-b:v',
          '5M'
        )
      } else if (mode === 'nvenc') {
        args.push('-c:v', 'h264_nvenc', '-preset', 'p4', '-b:v', '5M')
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

    const proc = spawn('ffmpeg', args, {
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
      '-i',
      inputUrl,
      '-map',
      `0:s:${subtitleIndex}`,
      '-f',
      'webvtt',
      'pipe:1',
    ]

    const proc = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    return proc.stdout
  }
}

export const transcoderService = new TranscoderService()
