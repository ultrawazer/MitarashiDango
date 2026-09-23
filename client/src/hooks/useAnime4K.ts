import { useEffect, useRef, useState, useCallback } from 'react'
import type { ModeA, ModeB, ModeC, ModeAA, ModeBB, ModeCA } from 'anime4k-webgpu-async'

type Preset = 'ModeA' | 'ModeB' | 'ModeC' | 'ModeAA' | 'ModeBB' | 'ModeCA'
export type Profile = 'low' | 'balanced' | 'high' | 'denoise'
type Pipeline = ModeA | ModeB | ModeC | ModeAA | ModeBB | ModeCA

interface UseAnime4KOptions {
  videoRef: { current: HTMLVideoElement | null }
  canvasRef: { current: HTMLCanvasElement | null }
  profile?: Profile
  delayMs?: number
  zeroCopy?: boolean
}

const PROFILE_SCALES: Record<Profile, { sd: number; hd: number; fhd: number }> = {
  low: { sd: 1.5, hd: 1.2, fhd: 1.1 },
  balanced: { sd: 2, hd: 1.5, fhd: 1.25 },
  high: { sd: 2.5, hd: 2, fhd: 1.5 },
  denoise: { sd: 1.5, hd: 1.25, fhd: 1.1 },
}

const PROFILE_PRESETS: Record<Profile, Preset> = {
  low: 'ModeB',
  balanced: 'ModeA',
  high: 'ModeAA',
  denoise: 'ModeC',
}

const MAX_CONSECUTIVE_ERRORS = 10
const queueCapFor = (delayMs: number) => Math.max(8, Math.min(40, Math.ceil(delayMs / 16.7) + 4))

export default function useAnime4K({
  videoRef,
  canvasRef,
  profile = 'balanced',
  delayMs = 0,
  zeroCopy = true,
}: UseAnime4KOptions) {
  const [isWebGPUSupported, setIsWebGPUSupported] = useState(false)
  const [isEnabled, setIsEnabled] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rebuildKey, setRebuildKey] = useState(0)

  const firstMount = useRef(true)
  const generationRef = useRef(0)
  const deviceRef = useRef<GPUDevice | null>(null)
  const contextRef = useRef<GPUCanvasContext | null>(null)
  const pipelineRef = useRef<Pipeline | null>(null)
  const inputTextureRef = useRef<GPUTexture | null>(null)
  const outputTextureRef = useRef<GPUTexture | null>(null)
  const renderPipelineRef = useRef<GPURenderPipeline | null>(null)
  const samplerRef = useRef<GPUSampler | null>(null)
  const bindGroupLayoutRef = useRef<GPUBindGroupLayout | null>(null)
  const rafRef = useRef<number | null>(null)

  const delayMsRef = useRef(delayMs)
  delayMsRef.current = delayMs
  const zeroCopyRef = useRef(zeroCopy)
  zeroCopyRef.current = zeroCopy

  const delayQueueRef = useRef<{ bitmap: ImageBitmap; capture: number }[]>([])
  const directUploadFailedRef = useRef(false)
  const lastTimeRef = useRef(-1)
  const lastCapturedRef = useRef(-1)
  const hasPrimedRef = useRef(false)
  const primedDelayRef = useRef(0)
  const inFlightRef = useRef(false)
  const errorCountRef = useRef(0)
  const lastFrameRef = useRef(-1)

  useEffect(() => {
    async function checkWebGPU() {
      if (typeof navigator === 'undefined' || !navigator.gpu) {
        setIsWebGPUSupported(false)
        return
      }
      try {
        const adapter = await navigator.gpu.requestAdapter()
        setIsWebGPUSupported(!!adapter)
      } catch {
        setIsWebGPUSupported(false)
      }
    }

    checkWebGPU()
  }, [videoRef, canvasRef])

  useEffect(() => {
    if (firstMount.current) {
      firstMount.current = false
      return
    }
    setIsEnabled(false)
  }, [profile])

  useEffect(() => {
    const closeBitmap = (bitmap: ImageBitmap | undefined) => {
      if (!bitmap) return
      try {
        bitmap.close()
      } catch {
        // ignore
      }
    }

    const flushDelayQueue = () => {
      for (const entry of delayQueueRef.current) closeBitmap(entry.bitmap)
      delayQueueRef.current = []
    }

    const cancelScheduled = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }

    if (!isEnabled || !isWebGPUSupported) {
      flushDelayQueue()
      cancelScheduled()
      inFlightRef.current = false
      lastCapturedRef.current = -1
      lastTimeRef.current = -1
      hasPrimedRef.current = false
      primedDelayRef.current = 0
      return
    }

    let cancelled = false
    const generation = ++generationRef.current

    async function setup() {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas) return
      if (generationRef.current !== generation) return

      setIsInitializing(true)
      setError(null)
      errorCountRef.current = 0
      inFlightRef.current = false
      directUploadFailedRef.current = false

      while (video.videoWidth === 0 || video.videoHeight === 0) {
        await new Promise((r) => requestAnimationFrame(r))
        if (cancelled || generationRef.current !== generation) return
      }

      const width = video.videoWidth
      const height = video.videoHeight
      const sourceMax = Math.max(width, height)
      const displayWidth = window.innerWidth
      const displayHeight = window.innerHeight
      const displayMax = Math.max(displayWidth, displayHeight)
      const scaleToMatch = sourceMax < displayMax ? displayMax / sourceMax : 1
      const scales = PROFILE_SCALES[profile]

      let targetScale: number
      if (sourceMax <= 720) {
        targetScale = scales.sd
      } else if (sourceMax <= 1080) {
        targetScale = scales.hd
      } else {
        targetScale = scales.fhd
      }

      const scale = Math.max(1, Math.min(scaleToMatch, targetScale))
      const outWidth = Math.round(width * scale)
      const outHeight = Math.round(height * scale)

      canvas.width = outWidth
      canvas.height = outHeight

      try {
        const adapter = await navigator.gpu.requestAdapter()
        if (!adapter) throw new Error('No GPU adapter found')
        if (generationRef.current !== generation) return

        const device = await adapter.requestDevice()
        if (generationRef.current !== generation) {
          device.destroy()
          return
        }

        const context = canvas.getContext('webgpu')
        if (!context) throw new Error('Failed to get WebGPU context')

        const format = navigator.gpu.getPreferredCanvasFormat()
        context.configure({
          device,
          format,
          alphaMode: 'opaque',
        })

        const inputTexture = device.createTexture({
          size: [width, height, 1],
          format: 'rgba8unorm',
          usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST |
            GPUTextureUsage.RENDER_ATTACHMENT,
        })

        const presetName = PROFILE_PRESETS[profile]
        const anime4kModule = await import('anime4k-webgpu-async')
        if (generationRef.current !== generation) {
          inputTexture.destroy()
          device.destroy()
          return
        }

        const PipelineClass = anime4kModule[presetName]
        const pipeline = new PipelineClass({
          device,
          inputTexture,
          nativeDimensions: { width, height },
          targetDimensions: { width: outWidth, height: outHeight },
        })
        const outputTexture = pipeline.getOutputTexture()

        const sampler = device.createSampler({
          magFilter: 'linear',
          minFilter: 'linear',
        })

        const shaderModule = device.createShaderModule({
          code: `
            @group(0) @binding(0) var tex: texture_2d<f32>;
            @group(0) @binding(1) var samp: sampler;
            struct VertexOutput {
              @builtin(position) pos: vec4f,
              @location(0) uv: vec2f,
            }
            @vertex
            fn vs(@builtin(vertex_index) idx: u32) -> VertexOutput {
              var positions = array<vec2f, 6>(
                vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
                vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0)
              );
              var uvs = array<vec2f, 6>(
                vec2f(0.0, 1.0), vec2f(1.0, 1.0), vec2f(0.0, 0.0),
                vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(1.0, 0.0)
              );
              var out: VertexOutput;
              out.pos = vec4f(positions[idx], 0.0, 1.0);
              out.uv = uvs[idx];
              return out;
            }
            @fragment
            fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
              return textureSample(tex, samp, uv);
            }
          `,
        })

        const bindGroupLayout = device.createBindGroupLayout({
          entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
          ],
        })

        const renderPipeline = device.createRenderPipeline({
          layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
          vertex: { module: shaderModule, entryPoint: 'vs' },
          fragment: { module: shaderModule, entryPoint: 'fs', targets: [{ format }] },
          primitive: { topology: 'triangle-list' },
        })

        const bindGroup = device.createBindGroup({
          layout: bindGroupLayout,
          entries: [
            { binding: 0, resource: outputTexture.createView() },
            { binding: 1, resource: sampler },
          ],
        })

        if (generationRef.current !== generation) {
          inputTexture.destroy()
          try {
            outputTexture.destroy()
          } catch {
            // ignore
          }
          device.destroy()
          return
        }

        deviceRef.current = device
        contextRef.current = context
        pipelineRef.current = pipeline
        inputTextureRef.current = inputTexture
        outputTextureRef.current = outputTexture
        renderPipelineRef.current = renderPipeline
        samplerRef.current = sampler
        bindGroupLayoutRef.current = bindGroupLayout

        setIsInitializing(false)

        function schedule() {
          if (cancelled || generationRef.current !== generation) return
          cancelScheduled()
          rafRef.current = requestAnimationFrame(() => {
            void frame()
          })
        }

        async function frame() {
          if (cancelled || generationRef.current !== generation) return
          const current = videoRef.current
          if (!current || current.videoWidth === 0) {
            schedule()
            return
          }
          if (current !== video || current.videoWidth !== width || current.videoHeight !== height) {
            setRebuildKey((k) => k + 1)
            return
          }
          if (
            current.paused ||
            current.ended ||
            document.hidden ||
            current.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
          ) {
            schedule()
            return
          }
          const presented = current.getVideoPlaybackQuality().totalVideoFrames
          if (presented === lastCapturedRef.current) {
            schedule()
            return
          }
          if (inFlightRef.current) {
            schedule()
            return
          }

          const mediaTime = current.currentTime
          if (
            current.seeking ||
            (lastTimeRef.current >= 0 && Math.abs(mediaTime - lastTimeRef.current) > 0.5)
          ) {
            flushDelayQueue()
            hasPrimedRef.current = false
            primedDelayRef.current = 0
            lastCapturedRef.current = -1
          }
          lastTimeRef.current = mediaTime

          const effectiveDelay = Math.max(0, delayMsRef.current || 0)
          if (effectiveDelay > primedDelayRef.current) hasPrimedRef.current = false
          inFlightRef.current = true

          try {
            const now = performance.now()
            let bitmap: ImageBitmap | null = null
            let retainFresh = false

            if (effectiveDelay <= 0) {
              if (delayQueueRef.current.length > 0) flushDelayQueue()
              hasPrimedRef.current = false
              primedDelayRef.current = 0

              let uploaded = false
              // Direct GPU Zero-Copy Upload Mode
              if (zeroCopyRef.current !== false && !directUploadFailedRef.current) {
                try {
                  device.queue.copyExternalImageToTexture(
                    { source: current },
                    { texture: inputTexture },
                    [width, height]
                  )
                  lastCapturedRef.current = presented
                  uploaded = true
                } catch (err) {
                  if (err instanceof TypeError) {
                    directUploadFailedRef.current = true
                    console.info(
                      '[anime4k] direct video upload unsupported on this device, using ImageBitmap fallback'
                    )
                  } else {
                    throw err
                  }
                }
              }

              // Bitmap Fallback / Legacy Compatibility Mode
              if (!uploaded) {
                const bmp = await createImageBitmap(current)
                lastCapturedRef.current = presented
                device.queue.copyExternalImageToTexture(
                  { source: bmp },
                  { texture: inputTexture },
                  [width, height]
                )
                closeBitmap(bmp)
              }
            } else {
              // Delayed frames queue for A/V sync calibration
              const fresh = await createImageBitmap(current)
              lastCapturedRef.current = presented
              const queue = delayQueueRef.current
              queue.push({ bitmap: fresh, capture: now })
              const cap = queueCapFor(effectiveDelay)
              while (queue.length > cap) closeBitmap(queue.shift()?.bitmap)

              let idx = -1
              for (let i = queue.length - 1; i >= 0; i--) {
                if (now - queue[i].capture >= effectiveDelay) {
                  idx = i
                  break
                }
              }

              if (idx !== -1) {
                for (let i = 0; i < idx; i++) closeBitmap(queue.shift()?.bitmap)
                const chosen = queue.shift()
                if (chosen) {
                  bitmap = chosen.bitmap
                  hasPrimedRef.current = true
                  primedDelayRef.current = effectiveDelay
                } else {
                  bitmap = fresh
                  retainFresh = true
                }
              } else if (!hasPrimedRef.current) {
                bitmap = fresh
                retainFresh = true
              } else {
                const oldest = queue.shift()
                bitmap = oldest ? oldest.bitmap : fresh
                if (!oldest) retainFresh = true
              }

              if (!bitmap) {
                inFlightRef.current = false
                schedule()
                return
              }

              device.queue.copyExternalImageToTexture(
                { source: bitmap },
                { texture: inputTexture },
                [width, height]
              )
              if (!retainFresh) closeBitmap(bitmap)
            }

            const encoder = device.createCommandEncoder()
            await pipeline.pass(encoder)

            const pass = encoder.beginRenderPass({
              colorAttachments: [
                {
                  view: context.getCurrentTexture().createView(),
                  clearValue: { r: 0, g: 0, b: 0, a: 1 },
                  loadOp: 'clear',
                  storeOp: 'store',
                },
              ],
            })
            pass.setPipeline(renderPipeline)
            pass.setBindGroup(0, bindGroup)
            pass.draw(6)
            pass.end()

            device.queue.submit([encoder.finish()])
            lastFrameRef.current = presented
            errorCountRef.current = 0

            device.queue.onSubmittedWorkDone().then(() => {
              if (generationRef.current === generation) inFlightRef.current = false
            })
          } catch (err) {
            inFlightRef.current = false
            errorCountRef.current += 1
            if (
              errorCountRef.current >= MAX_CONSECUTIVE_ERRORS &&
              !cancelled &&
              generationRef.current === generation
            ) {
              console.error(err)
              setError(err instanceof Error ? err.message : 'Render error')
              setIsEnabled(false)
              return
            }
          }

          schedule()
        }

        schedule()
      } catch (err) {
        if (!cancelled && generationRef.current === generation) {
          setError(err instanceof Error ? err.message : 'Failed to initialize upscaler')
          setIsInitializing(false)
          setIsEnabled(false)
        }
      }
    }

    setup()

    return () => {
      cancelled = true
      generationRef.current += 1
      cancelScheduled()
      flushDelayQueue()
      if (inputTextureRef.current) {
        inputTextureRef.current.destroy()
        inputTextureRef.current = null
      }
      if (outputTextureRef.current) {
        try {
          outputTextureRef.current.destroy()
        } catch {
          // ignore
        }
        outputTextureRef.current = null
      }
      if (deviceRef.current) {
        deviceRef.current.destroy()
        deviceRef.current = null
      }
      pipelineRef.current = null
      renderPipelineRef.current = null
      samplerRef.current = null
      bindGroupLayoutRef.current = null
      contextRef.current = null
      inFlightRef.current = false
    }
  }, [isEnabled, isWebGPUSupported, videoRef, canvasRef, profile, rebuildKey])

  const toggle = useCallback(() => {
    setIsEnabled((prev) => !prev)
  }, [])

  return {
    isWebGPUSupported,
    isEnabled,
    isInitializing,
    error,
    toggle,
  }
}
