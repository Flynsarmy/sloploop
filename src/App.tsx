import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, WheelEvent as ReactWheelEvent } from 'react'
import type WaveSurfer from 'wavesurfer.js'
import type RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import AppHeader from './components/AppHeader'
import ControlsPanel from './components/ControlsPanel'
import EditorPanel from './components/EditorPanel'
import type { LoopCurve, Mode } from './types/app'

declare global {
  interface Window {
    wavesurfer: WaveSurfer | null
  }
}

const MAX_FILE_DURATION_SEC = 600
const WAVEFORM_BASE_COLOR = '#4A9ABA'
const CROSSFADE_COLOR = 'var(--color-accent-orange)'
const SELECTION_FILL_COLOR = 'rgba(50, 50, 50, 0.45)'
const SELECTION_CROSSFADE_FILL =
  'color-mix(in srgb, var(--color-accent-orange) 72%, transparent)'
const DEFAULT_CROSSFADE_MAX_SEC = 5
const SELECTION_CROSSFADE_MAX_SEC = 0.2
const MIN_ZOOM = 20
const MAX_ZOOM = 400

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

function findNearestZeroCrossing(
  buffer: AudioBuffer,
  targetSample: number,
  maxDistance = 2048,
): number {
  const target = clamp(targetSample, 0, buffer.length - 1)
  let bestIndex = target
  let bestValue = Number.POSITIVE_INFINITY

  for (let offset = 0; offset <= maxDistance; offset += 1) {
    const left = target - offset
    const right = target + offset

    if (left >= 0) {
      let score = 0
      for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
        score += Math.abs(buffer.getChannelData(ch)[left])
      }
      if (score < bestValue) {
        bestValue = score
        bestIndex = left
      }
    }

    if (right < buffer.length) {
      let score = 0
      for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
        score += Math.abs(buffer.getChannelData(ch)[right])
      }
      if (score < bestValue) {
        bestValue = score
        bestIndex = right
      }
    }
  }

  return bestIndex
}

function createEmptyLike(buffer: AudioBuffer, length: number, ctx: AudioContext): AudioBuffer {
  return ctx.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate)
}

function copyBuffer(buffer: AudioBuffer, ctx: AudioContext): AudioBuffer {
  const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate)
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    out.copyToChannel(buffer.getChannelData(ch), ch)
  }
  return out
}

function normalizeBuffer(buffer: AudioBuffer): void {
  let peak = 0
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const channel = buffer.getChannelData(ch)
    for (let i = 0; i < channel.length; i += 1) {
      peak = Math.max(peak, Math.abs(channel[i]))
    }
  }

  if (peak <= 0 || peak >= 1) {
    return
  }

  const gain = 1 / peak
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const channel = buffer.getChannelData(ch)
    for (let i = 0; i < channel.length; i += 1) {
      channel[i] *= gain
    }
  }
}

function audioBufferToWavBytes(buffer: AudioBuffer): ArrayBuffer {
  const channels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const bitDepth = 16
  const bytesPerSample = bitDepth / 8
  const blockAlign = channels * bytesPerSample
  const dataLength = buffer.length * blockAlign
  const fileLength = 44 + dataLength
  const out = new ArrayBuffer(fileLength)
  const view = new DataView(out)

  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i))
    }
  }

  writeText(0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)
  writeText(36, 'data')
  view.setUint32(40, dataLength, true)

  let offset = 44
  for (let i = 0; i < buffer.length; i += 1) {
    for (let ch = 0; ch < channels; ch += 1) {
      const sample = clamp(buffer.getChannelData(ch)[i], -1, 1)
      const pcm = sample < 0 ? sample * 0x8000 : sample * 0x7fff
      view.setInt16(offset, pcm, true)
      offset += 2
    }
  }

  return out
}

function bufferToWavBlob(buffer: AudioBuffer): Blob {
  return new Blob([audioBufferToWavBytes(buffer)], { type: 'audio/wav' })
}

function triggerDownload(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(href)
}

function App() {
  type TransportState = 'play' | 'pause' | 'stop'

  const [mode, setMode] = useState<Mode>('loop')
  const [sourceName, setSourceName] = useState<string>('')
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null)
  const [regionStart, setRegionStart] = useState(0)
  const [regionEnd, setRegionEnd] = useState(0)
  const [zoom, setZoom] = useState(80)
  const [message, setMessage] = useState('Drop an audio file or use Open File to begin.')
  const [error, setError] = useState<string>('')
  const [isBusy, setIsBusy] = useState(false)

  const [loopCrossfadeSec, setLoopCrossfadeSec] = useState(0.12)
  const [crossfadeMaxSec, setCrossfadeMaxSec] = useState(DEFAULT_CROSSFADE_MAX_SEC)
  const [loopCurve, setLoopCurve] = useState<LoopCurve>('smoothstep')
  const [snapToZeroCrossing, setSnapToZeroCrossing] = useState(true)
  const [embedLoopSidecar, setEmbedLoopSidecar] = useState(false)

  const [clipFadeInMs, setClipFadeInMs] = useState(16)
  const [clipFadeOutMs, setClipFadeOutMs] = useState(16)

  const [cutCrossfadeSec, setCutCrossfadeSec] = useState(0.02)
  const [normalizeOutput, setNormalizeOutput] = useState(true)
  const [normalizedDisplayBuffer, setNormalizedDisplayBuffer] = useState<AudioBuffer | null>(null)

  const [transportState, setTransportState] = useState<TransportState>('stop')
  const [loopPreviewEnabled, setLoopPreviewEnabled] = useState(true)
  const [processedTransportState, setProcessedTransportState] = useState<TransportState>('stop')
  const [processedLoopPreviewEnabled, setProcessedLoopPreviewEnabled] = useState(true)
  const [undoCount, setUndoCount] = useState(0)
  const [isWaveformReady, setIsWaveformReady] = useState(false)
  const [hasActiveSelection, setHasActiveSelection] = useState(false)
  const [processedBuffer, setProcessedBuffer] = useState<AudioBuffer | null>(null)

  const waveformRef = useRef<HTMLDivElement | null>(null)
  const processedWaveformRef = useRef<HTMLDivElement | null>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const processedWavesurferRef = useRef<WaveSurfer | null>(null)
  const regionsRef = useRef<RegionsPlugin | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const undoRef = useRef<AudioBuffer[]>([])
  const zoomRef = useRef(zoom)
  const selectionPreviewBufferRef = useRef<AudioBuffer | null>(null)
  const selectionPreviewStartSecRef = useRef(0)
  const selectionPreviewDurationSecRef = useRef(0)
  const selectionPreviewOffsetSecRef = useRef(0)
  const selectionPreviewStartedAtSecRef = useRef(0)
  const playheadRafRef = useRef<number | null>(null)
  const styleRegionRef = useRef<(start: number, end: number, element?: HTMLElement | null) => void>(
    () => {},
  )
  const applyWaveColorsRef = useRef<(selectionActive: boolean) => void>(() => {})
  const clearSelectionRef = useRef<(newDuration?: number) => void>(() => {})
  const applySelectionCrossfadePresetRef = useRef<(start: number, end: number) => void>(() => {})
  const loadBufferIntoWaveformRef = useRef<(buffer: AudioBuffer) => Promise<void>>(() => Promise.resolve())
  const processedBufferRef = useRef<AudioBuffer | null>(null)
  const loopPreviewEnabledRef = useRef(loopPreviewEnabled)
  const processedLoopPreviewEnabledRef = useRef(processedLoopPreviewEnabled)
  const processedPreviewSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const processedPreviewOffsetSecRef = useRef(0)
  const processedPreviewStartedAtSecRef = useRef(0)
  const processedPlayheadRafRef = useRef<number | null>(null)
  const isRestoringRegionRef = useRef(false)

  useEffect(() => {
    loopPreviewEnabledRef.current = loopPreviewEnabled
  }, [loopPreviewEnabled])

  useEffect(() => {
    processedLoopPreviewEnabledRef.current = processedLoopPreviewEnabled
  }, [processedLoopPreviewEnabled])

  const getSelectionCrossfadeSeconds = useCallback(() => {
    if (mode === 'loop') {
      return loopCrossfadeSec
    }
    if (mode === 'clip') {
      return Math.max(clipFadeInMs, clipFadeOutMs) / 1000
    }
    return cutCrossfadeSec
  }, [clipFadeInMs, clipFadeOutMs, cutCrossfadeSec, loopCrossfadeSec, mode])

  const applySelectionCrossfadePreset = useCallback((start: number, end: number) => {
    const selectionSeconds = Math.max(0, end - start)
    const nextMax = SELECTION_CROSSFADE_MAX_SEC
    const nextValue = clamp(selectionSeconds * 0.1, 0, nextMax)
    setCrossfadeMaxSec(nextMax)
    setLoopCrossfadeSec(clamp(nextValue, 0.001, nextMax))
    setCutCrossfadeSec(nextValue)
  }, [])

  const styleRegion = useCallback(
    (start: number, end: number, element?: HTMLElement | null) => {
      if (!element) {
        return
      }

      const span = Math.max(0.001, end - start)
      const crossfadeSeconds = getSelectionCrossfadeSeconds()
      const percent = clamp((crossfadeSeconds / span) * 100, 0, 49.5)
      const edgeStop = `${percent.toFixed(3)}%`
      const innerStop = `${(100 - percent).toFixed(3)}%`

      element.style.background = `linear-gradient(90deg, ${SELECTION_CROSSFADE_FILL} 0%, ${SELECTION_CROSSFADE_FILL} ${edgeStop}, ${SELECTION_FILL_COLOR} ${edgeStop}, ${SELECTION_FILL_COLOR} ${innerStop}, ${SELECTION_CROSSFADE_FILL} ${innerStop}, ${SELECTION_CROSSFADE_FILL} 100%)`
      element.style.backdropFilter = 'brightness(1.85) saturate(1.2)'
      element.style.borderLeft = `1px solid ${CROSSFADE_COLOR}`
      element.style.borderRight = `1px solid ${CROSSFADE_COLOR}`
      element.style.boxSizing = 'border-box'
    },
    [getSelectionCrossfadeSeconds],
  )

  const applyWaveColors = useCallback(() => {
    const container = waveformRef.current
    if (!container) {
      return
    }
  }, [])

  const getAudioContext = useCallback(() => {
    if (!contextRef.current) {
      contextRef.current = new AudioContext()
    }
    return contextRef.current
  }, [])

  const stopPlayheadTracking = useCallback(() => {
    if (playheadRafRef.current !== null) {
      cancelAnimationFrame(playheadRafRef.current)
      playheadRafRef.current = null
    }
  }, [])

  const stopProcessedPlayheadTracking = useCallback(() => {
    if (processedPlayheadRafRef.current !== null) {
      cancelAnimationFrame(processedPlayheadRafRef.current)
      processedPlayheadRafRef.current = null
    }
  }, [])

  const startPlayheadTracking = useCallback(() => {
    const ctx = contextRef.current
    const ws = wavesurferRef.current
    const selectionDuration = selectionPreviewDurationSecRef.current
    const selectionStart = selectionPreviewStartSecRef.current

    if (!ctx || !ws || selectionDuration <= 0) {
      return
    }

    stopPlayheadTracking()

    const tick = () => {
      const wsCurrent = wavesurferRef.current
      const ctxCurrent = contextRef.current
      if (!wsCurrent || !ctxCurrent || !previewSourceRef.current) {
        playheadRafRef.current = null
        return
      }

      const elapsed =
        selectionPreviewOffsetSecRef.current +
        Math.max(0, ctxCurrent.currentTime - selectionPreviewStartedAtSecRef.current)
      const offset = loopPreviewEnabledRef.current
        ? elapsed % selectionDuration
        : Math.min(elapsed, selectionDuration)
      ;(wsCurrent as WaveSurfer & { setTime?: (time: number) => void }).setTime?.(selectionStart + offset)

      if (!loopPreviewEnabledRef.current && elapsed >= selectionDuration) {
        playheadRafRef.current = null
        return
      }

      playheadRafRef.current = requestAnimationFrame(tick)
    }

    playheadRafRef.current = requestAnimationFrame(tick)
  }, [stopPlayheadTracking])

  const startProcessedPlayheadTracking = useCallback(() => {
    const ctx = contextRef.current
    const ws = processedWavesurferRef.current
    const duration = processedBuffer?.duration ?? 0

    if (!ctx || !ws || duration <= 0) {
      return
    }

    stopProcessedPlayheadTracking()

    const tick = () => {
      const wsCurrent = processedWavesurferRef.current
      const ctxCurrent = contextRef.current
      const bufferCurrent = processedBuffer
      if (!wsCurrent || !ctxCurrent || !bufferCurrent || !processedPreviewSourceRef.current) {
        processedPlayheadRafRef.current = null
        return
      }

      const elapsed =
        processedPreviewOffsetSecRef.current +
        Math.max(0, ctxCurrent.currentTime - processedPreviewStartedAtSecRef.current)
      const offset = processedLoopPreviewEnabledRef.current
        ? elapsed % bufferCurrent.duration
        : Math.min(elapsed, bufferCurrent.duration)

      ;(wsCurrent as WaveSurfer & { setTime?: (time: number) => void }).setTime?.(offset)

      if (!processedLoopPreviewEnabledRef.current && elapsed >= bufferCurrent.duration) {
        processedPlayheadRafRef.current = null
        return
      }

      processedPlayheadRafRef.current = requestAnimationFrame(tick)
    }

    processedPlayheadRafRef.current = requestAnimationFrame(tick)
  }, [processedBuffer, stopProcessedPlayheadTracking])

  const startSelectionPreview = useCallback(
    async (offsetSeconds: number) => {
      const buffer = selectionPreviewBufferRef.current
      if (!buffer) {
        return
      }

      const ctx = getAudioContext()
      if (ctx.state !== 'running') {
        await ctx.resume()
      }

      if (previewSourceRef.current) {
        previewSourceRef.current.onended = null
        previewSourceRef.current.stop()
        previewSourceRef.current.disconnect()
        previewSourceRef.current = null
      }

      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.loop = loopPreviewEnabledRef.current
      source.connect(ctx.destination)
      source.onended = () => {
        if (previewSourceRef.current !== source) {
          return
        }

        previewSourceRef.current = null
        if (!loopPreviewEnabledRef.current) {
          selectionPreviewOffsetSecRef.current = 0
          stopPlayheadTracking()
          setTransportState('stop')
        }
      }

      const safeOffset = clamp(offsetSeconds, 0, Math.max(0, buffer.duration - 0.001))
      selectionPreviewStartedAtSecRef.current = ctx.currentTime
      previewSourceRef.current = source
      source.start(0, safeOffset)
      setTransportState('play')
      startPlayheadTracking()
    },
    [getAudioContext, startPlayheadTracking, stopPlayheadTracking],
  )

  const stopPreview = useCallback(() => {
    const ws = wavesurferRef.current
    if (ws) {
      const transport = ws as WaveSurfer & { stop?: () => void; pause?: () => void }
      if (transport.stop) {
        transport.stop()
      } else if (transport.pause) {
        transport.pause()
      }
    }

    if (previewSourceRef.current) {
      previewSourceRef.current.onended = null
      previewSourceRef.current.stop()
      previewSourceRef.current.disconnect()
      previewSourceRef.current = null
    }

    stopPlayheadTracking()
    selectionPreviewOffsetSecRef.current = 0
    setTransportState('stop')
  }, [stopPlayheadTracking])

  const stopProcessedPreview = useCallback(() => {
    if (processedPreviewSourceRef.current) {
      processedPreviewSourceRef.current.onended = null
      processedPreviewSourceRef.current.stop()
      processedPreviewSourceRef.current.disconnect()
      processedPreviewSourceRef.current = null
    }

    stopProcessedPlayheadTracking()
    processedPreviewOffsetSecRef.current = 0
    ;(processedWavesurferRef.current as WaveSurfer & { setTime?: (time: number) => void })?.setTime?.(0)
    setProcessedTransportState('stop')
  }, [stopProcessedPlayheadTracking])

  const pauseProcessedPreview = useCallback(() => {
    const source = processedPreviewSourceRef.current
    const buffer = processedBuffer
    const ctx = contextRef.current
    if (!source || !buffer || !ctx) {
      return
    }

    const elapsed =
      processedPreviewOffsetSecRef.current +
      Math.max(0, ctx.currentTime - processedPreviewStartedAtSecRef.current)
    processedPreviewOffsetSecRef.current = processedLoopPreviewEnabledRef.current
      ? elapsed % buffer.duration
      : Math.min(elapsed, buffer.duration)

    source.onended = null
    source.stop()
    source.disconnect()
    processedPreviewSourceRef.current = null
    stopProcessedPlayheadTracking()
    setProcessedTransportState('pause')
  }, [processedBuffer, stopProcessedPlayheadTracking])

  const startProcessedPreview = useCallback(
    async (offsetSeconds: number) => {
      const buffer = processedBuffer
      if (!buffer) {
        return
      }

      const ctx = getAudioContext()
      if (ctx.state !== 'running') {
        await ctx.resume()
      }

      if (processedPreviewSourceRef.current) {
        processedPreviewSourceRef.current.onended = null
        processedPreviewSourceRef.current.stop()
        processedPreviewSourceRef.current.disconnect()
        processedPreviewSourceRef.current = null
      }

      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.loop = processedLoopPreviewEnabledRef.current
      source.connect(ctx.destination)
      source.onended = () => {
        if (processedPreviewSourceRef.current !== source) {
          return
        }

        processedPreviewSourceRef.current = null
        if (!processedLoopPreviewEnabledRef.current) {
          processedPreviewOffsetSecRef.current = 0
          stopProcessedPlayheadTracking()
          setProcessedTransportState('stop')
        }
      }

      const safeOffset = clamp(offsetSeconds, 0, Math.max(0, buffer.duration - 0.001))
      processedPreviewStartedAtSecRef.current = ctx.currentTime
      processedPreviewSourceRef.current = source
      ;(processedWavesurferRef.current as WaveSurfer & { setTime?: (time: number) => void })?.setTime?.(safeOffset)
      source.start(0, safeOffset)
      setProcessedTransportState('play')
      startProcessedPlayheadTracking()
    },
    [getAudioContext, processedBuffer, startProcessedPlayheadTracking, stopProcessedPlayheadTracking],
  )

  const playProcessedPreview = useCallback(async () => {
    if (!processedBuffer) {
      return
    }

    stopPreview()

    if (processedTransportState === 'pause') {
      await startProcessedPreview(processedPreviewOffsetSecRef.current)
      return
    }

    processedPreviewOffsetSecRef.current = 0
    await startProcessedPreview(0)
  }, [processedBuffer, processedTransportState, startProcessedPreview, stopPreview])

  const ensureSelectionSamples = useCallback(
    (buffer: AudioBuffer, applyZeroSnap: boolean) => {
      let startSample = Math.floor(clamp(regionStart, 0, buffer.duration) * buffer.sampleRate)
      let endSample = Math.floor(clamp(regionEnd, 0, buffer.duration) * buffer.sampleRate)

      if (endSample <= startSample + 1) {
        endSample = Math.min(buffer.length, startSample + 2)
      }

      if (applyZeroSnap) {
        startSample = findNearestZeroCrossing(buffer, startSample)
        endSample = findNearestZeroCrossing(buffer, endSample)
      }

      startSample = clamp(startSample, 0, buffer.length - 2)
      endSample = clamp(endSample, startSample + 1, buffer.length)

      return { startSample, endSample }
    },
    [regionEnd, regionStart],
  )

  const processClip = useCallback(
    (buffer: AudioBuffer) => {
      const ctx = getAudioContext()
      const { startSample, endSample } = ensureSelectionSamples(buffer, false)
      const outLength = endSample - startSample
      const out = createEmptyLike(buffer, outLength, ctx)

      const fadeInSamples = Math.min(
        Math.floor((clipFadeInMs / 1000) * buffer.sampleRate),
        outLength,
      )
      const fadeOutSamples = Math.min(
        Math.floor((clipFadeOutMs / 1000) * buffer.sampleRate),
        outLength,
      )

      for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
        const input = buffer.getChannelData(ch)
        const channel = out.getChannelData(ch)
        channel.set(input.subarray(startSample, endSample))

        for (let i = 0; i < fadeInSamples; i += 1) {
          channel[i] *= i / Math.max(1, fadeInSamples)
        }
        for (let i = 0; i < fadeOutSamples; i += 1) {
          const idx = outLength - 1 - i
          channel[idx] *= i / Math.max(1, fadeOutSamples)
        }
      }

      if (normalizeOutput) {
        normalizeBuffer(out)
      }
      return out
    },
    [clipFadeInMs, clipFadeOutMs, ensureSelectionSamples, getAudioContext, normalizeOutput],
  )

  const processLoop = useCallback(
    (buffer: AudioBuffer) => {
      const ctx = getAudioContext()
      const { startSample, endSample } = ensureSelectionSamples(buffer, snapToZeroCrossing)
      const selectedLen = endSample - startSample

      const desiredCrossfade = Math.floor(loopCrossfadeSec * buffer.sampleRate)
      const crossfadeSamples = clamp(desiredCrossfade, 1, Math.floor(selectedLen / 2))
      const outLength = selectedLen - crossfadeSamples
      const out = createEmptyLike(buffer, outLength, ctx)

      for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
        const input = buffer.getChannelData(ch)
        const segment = input.subarray(startSample, endSample)
        const channel = out.getChannelData(ch)
        channel.set(segment.subarray(0, outLength))

        for (let i = 0; i < crossfadeSamples; i += 1) {
          const t = i / Math.max(1, crossfadeSamples - 1)
          const inGain =
            loopCurve === 'equal-power' ? Math.sin(t * Math.PI * 0.5) : smoothstep(t)
          const outGain =
            loopCurve === 'equal-power' ? Math.cos(t * Math.PI * 0.5) : 1 - smoothstep(t)

          // Build the loop seam at the buffer start by transitioning tail -> head.
          const tailValue = segment[segment.length - crossfadeSamples + i]
          const headValue = segment[i]
          channel[i] = tailValue * outGain + headValue * inGain
        }
      }

      if (normalizeOutput) {
        normalizeBuffer(out)
      }

      return out
    },
    [
      ensureSelectionSamples,
      getAudioContext,
      loopCrossfadeSec,
      loopCurve,
      normalizeOutput,
      snapToZeroCrossing,
    ],
  )

  const processCut = useCallback(
    (buffer: AudioBuffer) => {
      const ctx = getAudioContext()
      const { startSample, endSample } = ensureSelectionSamples(buffer, snapToZeroCrossing)
      const beforeLen = startSample
      const afterLen = buffer.length - endSample

      if (beforeLen < 1 || afterLen < 1) {
        throw new Error('Cut selection must leave audio on both sides.')
      }

      const requestedCrossfade = Math.floor(cutCrossfadeSec * buffer.sampleRate)
      const crossfadeSamples = clamp(requestedCrossfade, 0, Math.min(beforeLen, afterLen))
      const outLength = beforeLen + afterLen - crossfadeSamples

      const out = createEmptyLike(buffer, outLength, ctx)

      for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
        const input = buffer.getChannelData(ch)
        const channel = out.getChannelData(ch)

        if (crossfadeSamples === 0) {
          channel.set(input.subarray(0, beforeLen), 0)
          channel.set(input.subarray(endSample), beforeLen)
          continue
        }

        const dryBefore = beforeLen - crossfadeSamples
        channel.set(input.subarray(0, dryBefore), 0)

        for (let i = 0; i < crossfadeSamples; i += 1) {
          const t = i / Math.max(1, crossfadeSamples - 1)
          const x = smoothstep(t)
          const a = input[dryBefore + i]
          const b = input[endSample + i]
          channel[dryBefore + i] = a * (1 - x) + b * x
        }

        channel.set(input.subarray(endSample + crossfadeSamples), beforeLen)
      }

      if (normalizeOutput) {
        normalizeBuffer(out)
      }

      return out
    },
    [cutCrossfadeSec, ensureSelectionSamples, getAudioContext, normalizeOutput, snapToZeroCrossing],
  )

  const processByMode = useCallback(
    (buffer: AudioBuffer) => {
      if (mode === 'clip') {
        return processClip(buffer)
      }
      if (mode === 'cut') {
        return processCut(buffer)
      }
      return processLoop(buffer)
    },
    [mode, processClip, processCut, processLoop],
  )

  const clearSelection = useCallback((newDuration?: number) => {
    const regions = regionsRef.current
    if (!regions) {
      return
    }

    regions.getRegions().forEach((region) => region.remove())
    const dur = newDuration ?? wavesurferRef.current?.getDuration() ?? audioBuffer?.duration ?? 0
    setRegionStart(0)
    setRegionEnd(dur)
    setCrossfadeMaxSec(DEFAULT_CROSSFADE_MAX_SEC)
    ;(wavesurferRef.current as WaveSurfer & {
      setOptions?: (options: { cursorWidth: number }) => void
    })?.setOptions?.({ cursorWidth: 0 })
    setTransportState('stop')
    applyWaveColors()
  }, [applyWaveColors, audioBuffer])

  useEffect(() => {
    styleRegionRef.current = styleRegion
  }, [styleRegion])

  useEffect(() => {
    applyWaveColorsRef.current = applyWaveColors
  }, [applyWaveColors])

  useEffect(() => {
    clearSelectionRef.current = clearSelection
  }, [clearSelection])

  useEffect(() => {
    applySelectionCrossfadePresetRef.current = applySelectionCrossfadePreset
  }, [applySelectionCrossfadePreset])

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  const loadBufferIntoWaveform = useCallback(
    async (buffer: AudioBuffer) => {
      const ws = wavesurferRef.current
      if (!ws) {
        return
      }

      setIsWaveformReady(false)
      const channelData: Float32Array[] = []
      for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
        channelData.push(buffer.getChannelData(ch))
      }
      await ws.load('', channelData, buffer.duration)

      if (ws.getDuration() > 0 && ws.getDecodedData()) {
        ws.zoom(zoomRef.current)
      }

      const shouldRestoreRegion = hasActiveSelection && regionEnd > regionStart
      if (shouldRestoreRegion) {
        const regions = regionsRef.current
        if (regions) {
          const maxStart = Math.max(0, buffer.duration - 0.001)
          const start = clamp(regionStart, 0, maxStart)
          const end = clamp(regionEnd, start + 0.001, buffer.duration)

          regions.getRegions().forEach((region) => region.remove())
          isRestoringRegionRef.current = true
          try {
            regions.addRegion({
              start,
              end,
              color: 'rgba(74, 154, 186, 0.35)',
              drag: true,
              resize: true,
            })
          } finally {
            isRestoringRegionRef.current = false
          }
        }
      } else {
        clearSelectionRef.current(buffer.duration)
      }
      setIsWaveformReady(true)
    },
    [hasActiveSelection, regionEnd, regionStart],
  )

  useEffect(() => {
    loadBufferIntoWaveformRef.current = loadBufferIntoWaveform
  }, [loadBufferIntoWaveform])

  useEffect(() => {
    processedBufferRef.current = processedBuffer
  }, [processedBuffer])

  const decodeFile = useCallback(
    async (file: File) => {
      setError('')
      setIsBusy(true)
      setIsWaveformReady(false)
      stopPreview()
      stopProcessedPreview()
      clearSelectionRef.current(0)
      setAudioBuffer(null)
      setProcessedBuffer(null)
      setHasActiveSelection(false)
      setSourceName('')
      setMessage(`Loading ${file.name}...`)

      try {
        const arrayBuffer = await file.arrayBuffer()
        const ctx = getAudioContext()
        const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0))

        if (decoded.duration > MAX_FILE_DURATION_SEC) {
          throw new Error('File exceeds 10-minute limit. Please trim externally first.')
        }

        setAudioBuffer(decoded)
        setSourceName(file.name.replace(/\.[^.]+$/, ''))
        undoRef.current = []
        setUndoCount(0)
        setMessage(`Loaded ${file.name} (${decoded.duration.toFixed(2)}s)`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to decode this file format.'
        setError(msg)
      } finally {
        setIsBusy(false)
      }
    },
    [getAudioContext, stopPreview, stopProcessedPreview],
  )

  const onFileInput = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) {
        return
      }
      await decodeFile(file)
      event.target.value = ''
    },
    [decodeFile],
  )

  const onDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      const file = event.dataTransfer.files?.[0]
      if (file) {
        await decodeFile(file)
      }
    },
    [decodeFile],
  )

  const onWheelNudge = useCallback(
    (
      event: ReactWheelEvent<HTMLInputElement>,
      value: number,
      setter: (v: number) => void,
      step: number,
      min: number,
      max: number,
    ) => {
      event.preventDefault()
      const delta = event.deltaY > 0 ? -step : step
      setter(clamp(value + delta, min, max))
    },
    [],
  )

  const previewSelection = useCallback(async () => {
    const buf = (normalizeOutput && normalizedDisplayBuffer) ? normalizedDisplayBuffer : audioBuffer
    if (!buf) {
      return
    }

    const ws = wavesurferRef.current
    if (!ws) {
      return
    }

    if (transportState === 'pause' && selectionPreviewBufferRef.current) {
      await startSelectionPreview(selectionPreviewOffsetSecRef.current)
      setMessage('Previewing selection')
      return
    }

    stopPreview()
    stopProcessedPreview()
    const { startSample, endSample } = ensureSelectionSamples(buf, false)
    const startSeconds = startSample / buf.sampleRate
    const endSeconds = endSample / buf.sampleRate
    const durationSeconds = Math.max(0.001, endSeconds - startSeconds)
    const ctx = getAudioContext()
    const out = ctx.createBuffer(
      buf.numberOfChannels,
      Math.max(1, endSample - startSample),
      buf.sampleRate,
    )

    for (let ch = 0; ch < buf.numberOfChannels; ch += 1) {
      out.copyToChannel(buf.getChannelData(ch).subarray(startSample, endSample), ch)
    }

    selectionPreviewBufferRef.current = out
    selectionPreviewStartSecRef.current = startSeconds
    selectionPreviewDurationSecRef.current = durationSeconds
    selectionPreviewOffsetSecRef.current = 0

    ;(ws as WaveSurfer & { setOptions?: (options: { cursorWidth: number }) => void }).setOptions?.({
      cursorWidth: 2,
    })
    ;(ws as WaveSurfer & { setTime?: (time: number) => void }).setTime?.(startSeconds)
    await startSelectionPreview(0)
    setMessage('Previewing selection')
  }, [
    audioBuffer,
    normalizedDisplayBuffer,
    normalizeOutput,
    ensureSelectionSamples,
    getAudioContext,
    startSelectionPreview,
    stopProcessedPreview,
    stopPreview,
    transportState,
  ])

  const pauseSelection = useCallback(() => {
    const source = previewSourceRef.current
    const buffer = selectionPreviewBufferRef.current
    const ctx = contextRef.current
    if (!source || !buffer || !ctx) {
      return
    }

    const elapsed =
      selectionPreviewOffsetSecRef.current +
      Math.max(0, ctx.currentTime - selectionPreviewStartedAtSecRef.current)
    selectionPreviewOffsetSecRef.current = loopPreviewEnabledRef.current
      ? elapsed % selectionPreviewDurationSecRef.current
      : Math.min(elapsed, selectionPreviewDurationSecRef.current)

    source.onended = null
    source.stop()
    source.disconnect()
    previewSourceRef.current = null
    stopPlayheadTracking()
    setTransportState('pause')
  }, [stopPlayheadTracking])

  const applyCut = useCallback(() => {
    if (!audioBuffer) {
      return
    }
    setError('')
    try {
      const ctx = getAudioContext()
      undoRef.current.push(copyBuffer(audioBuffer, ctx))
      if (undoRef.current.length > 15) {
        undoRef.current.shift()
      }
      setUndoCount(undoRef.current.length)

      const cut = processCut(audioBuffer)
      setAudioBuffer(cut)
      setMessage('Cut applied to source. You can undo if needed.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cut failed.')
    }
  }, [audioBuffer, getAudioContext, processCut])

  const undoCut = useCallback(() => {
    const previous = undoRef.current.pop()
    setUndoCount(undoRef.current.length)
    if (previous) {
      setAudioBuffer(previous)
      setMessage('Undo successful.')
      setError('')
    }
  }, [])

  const exportWav = useCallback(() => {
    if (!audioBuffer) {
      return
    }
    setError('')
    try {
      const out = mode === 'cut' ? audioBuffer : processByMode(audioBuffer)
      const safeName = sourceName || 'sloploop-export'
      const suffix = mode === 'loop' ? 'loop' : mode === 'clip' ? 'clip' : 'cut'
      triggerDownload(bufferToWavBlob(out), `${safeName}-${suffix}.wav`)

      if (mode === 'loop' && embedLoopSidecar) {
        const metadata = {
          format: 'sloploop-sidecar-v1',
          loopStartSeconds: 0,
          loopEndSeconds: out.duration,
        }
        triggerDownload(
          new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' }),
          `${safeName}-${suffix}.loop.json`,
        )
      }

      setMessage(`Exported ${suffix.toUpperCase()} as WAV`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.')
    }
  }, [audioBuffer, embedLoopSidecar, mode, processByMode, sourceName])

  useEffect(() => {
    if (!waveformRef.current) {
      return
    }

    let disposed = false
    let cleanup: (() => void) | null = null

    const initWaveform = async () => {
      const [{ default: WaveSurferLib }, { default: RegionsPluginLib }] = await Promise.all([
        import('wavesurfer.js'),
        import('wavesurfer.js/dist/plugins/regions.esm.js'),
      ])

      if (disposed || !waveformRef.current) {
        return
      }

      const regions = RegionsPluginLib.create()
      const ws = WaveSurferLib.create({
        container: waveformRef.current,
        waveColor: WAVEFORM_BASE_COLOR,
        progressColor: WAVEFORM_BASE_COLOR,
        cursorWidth: 0,
        height: 110,
        barWidth: 2,
        barGap: 1,
        normalize: false,
        interact: true,
        autoScroll: true,
        plugins: [regions],
      })

      wavesurferRef.current = ws
      window.wavesurfer = ws
      regionsRef.current = regions
      setIsWaveformReady(false)

      const wrapper =
        typeof (ws as WaveSurfer & { getWrapper?: () => HTMLElement }).getWrapper === 'function'
          ? (ws as WaveSurfer & { getWrapper: () => HTMLElement }).getWrapper()
          : waveformRef.current

      if (!wrapper) {
        ws.destroy()
        wavesurferRef.current = null
        window.wavesurfer = null
        regionsRef.current = null
        return
      }

      const scrollContainer =
        wrapper.parentElement instanceof HTMLElement ? wrapper.parentElement : wrapper

      regions.enableDragSelection({
        color: 'rgba(74, 154, 186, 0.35)',
      })

      const syncRegion = (start: number, end: number) => {
        setRegionStart(start)
        setRegionEnd(end)
      }

      regions.on('region-created', (current) => {
        regions.getRegions().forEach((region) => {
          if (region.id !== current.id) {
            region.remove()
          }
        })
        if (!isRestoringRegionRef.current) {
          applySelectionCrossfadePresetRef.current(current.start, current.end)
        }
        styleRegionRef.current(current.start, current.end, (current as { element?: HTMLElement }).element)
        applyWaveColorsRef.current(true)
        syncRegion(current.start, current.end)
        setHasActiveSelection(true)
        ;(ws as WaveSurfer & { setOptions?: (options: { cursorWidth: number }) => void }).setOptions?.({
          cursorWidth: 2,
        })
        ;(ws as WaveSurfer & { setTime?: (time: number) => void }).setTime?.(current.start)
        setTransportState('stop')
      })

      regions.on('region-updated', (region) => {
        if (!isRestoringRegionRef.current) {
          applySelectionCrossfadePresetRef.current(region.start, region.end)
        }
        styleRegionRef.current(region.start, region.end, (region as { element?: HTMLElement }).element)
        applyWaveColorsRef.current(true)
        syncRegion(region.start, region.end)
        setHasActiveSelection(true)
        ;(ws as WaveSurfer & { setOptions?: (options: { cursorWidth: number }) => void }).setOptions?.({
          cursorWidth: 2,
        })
        ;(ws as WaveSurfer & { setTime?: (time: number) => void }).setTime?.(region.start)
        setTransportState('stop')
      })

      regions.on('region-removed', () => {
        const active = regions.getRegions().length > 0
        applyWaveColorsRef.current(active)
        setHasActiveSelection(active)
      })

      let isMiddlePanning = false
      let panStartX = 0
      let panStartScrollLeft = 0

      const onPointerDown = (event: PointerEvent) => {
        if (event.button === 1) {
          isMiddlePanning = true
          panStartX = event.clientX
          panStartScrollLeft = scrollContainer.scrollLeft
          scrollContainer.style.cursor = 'grabbing'
          event.preventDefault()
        }
      }

      const onPointerMove = (event: PointerEvent) => {
        if (!isMiddlePanning) {
          return
        }
        scrollContainer.scrollLeft = panStartScrollLeft - (event.clientX - panStartX)
        event.preventDefault()
      }

      const stopMiddlePan = () => {
        isMiddlePanning = false
        scrollContainer.style.cursor = ''
      }

      const onWheel = (event: WheelEvent) => {
        const wsInstance = wavesurferRef.current
        if (!wsInstance || wsInstance.getDuration() <= 0 || !wsInstance.getDecodedData()) {
          return
        }

        event.preventDefault()
        const delta = event.deltaY < 0 ? 10 : -10
        setZoom((prev) => clamp(prev + delta, MIN_ZOOM, MAX_ZOOM))
      }

      scrollContainer.addEventListener('pointerdown', onPointerDown)
      scrollContainer.addEventListener('pointermove', onPointerMove)
      scrollContainer.addEventListener('pointerup', stopMiddlePan)
      scrollContainer.addEventListener('pointercancel', stopMiddlePan)
      scrollContainer.addEventListener('wheel', onWheel, { passive: false })

      ws.on('interaction', () => {
        stopPreview()
      })

      ws.on('finish', () => {
        setTransportState('stop')
      })

      cleanup = () => {
        stopPreview()
        stopProcessedPreview()
        scrollContainer.removeEventListener('pointerdown', onPointerDown)
        scrollContainer.removeEventListener('pointermove', onPointerMove)
        scrollContainer.removeEventListener('pointerup', stopMiddlePan)
        scrollContainer.removeEventListener('pointercancel', stopMiddlePan)
        scrollContainer.removeEventListener('wheel', onWheel)
        ws.destroy()
        wavesurferRef.current = null
        window.wavesurfer = null
        regionsRef.current = null
      }
    }

    void initWaveform().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to initialize waveform renderer.'
      setError(msg)
    })

    return () => {
      disposed = true
      cleanup?.()
    }
  }, [stopPreview, stopProcessedPreview])

  useEffect(() => {
    if (!hasActiveSelection || !processedBuffer) {
      if (processedWavesurferRef.current) {
        processedWavesurferRef.current.destroy()
        processedWavesurferRef.current = null
      }
      return
    }

    if (!processedWaveformRef.current || processedWavesurferRef.current) {
      return
    }

    let disposed = false
    let ws: WaveSurfer | null = null

    const initProcessedWaveform = async () => {
      const { default: WaveSurferLib } = await import('wavesurfer.js')

      if (disposed || !processedWaveformRef.current || processedWavesurferRef.current) {
        return
      }

      ws = WaveSurferLib.create({
        container: processedWaveformRef.current,
        waveColor: WAVEFORM_BASE_COLOR,
        progressColor: WAVEFORM_BASE_COLOR,
        cursorWidth: 2,
        height: 110,
        barWidth: 2,
        barGap: 1,
        normalize: false,
        interact: true,
        autoScroll: true,
      })

      processedWavesurferRef.current = ws

      ws.on('interaction', () => {
        setProcessedTransportState('pause')
      })

      // The buffer-loading effect already ran before this async init completed;
      // trigger the load now that ws is available.
      const currentBuffer = processedBufferRef.current
      if (currentBuffer && !disposed) {
        const channelData: Float32Array[] = []
        for (let ch = 0; ch < currentBuffer.numberOfChannels; ch += 1) {
          channelData.push(currentBuffer.getChannelData(ch))
        }
        void ws.load('', channelData, currentBuffer.duration)
          .then(() => { if (!disposed) setProcessedTransportState('stop') })
          .catch(() => { if (!disposed) setProcessedBuffer(null) })
      }
    }

    void initProcessedWaveform().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to initialize processed waveform.'
      setError(msg)
    })

    return () => {
      disposed = true
      if (ws && processedWavesurferRef.current === ws) {
        stopProcessedPreview()
        ws.destroy()
        processedWavesurferRef.current = null
      }
    }
  }, [hasActiveSelection, processedBuffer, stopProcessedPreview])

  useEffect(() => {
    if (!audioBuffer || !hasActiveSelection) {
      stopProcessedPreview()
      setProcessedBuffer(null)
      return
    }

    const buf = (normalizeOutput && normalizedDisplayBuffer) ? normalizedDisplayBuffer : audioBuffer
    try {
      const out = processByMode(buf)
      setProcessedBuffer(out)
    } catch {
      setProcessedBuffer(null)
    }
  }, [audioBuffer, normalizedDisplayBuffer, normalizeOutput, hasActiveSelection, processByMode, stopProcessedPreview])

  useEffect(() => {
    const ws = processedWavesurferRef.current
    if (!ws || !processedBuffer) {
      return
    }

    const transport = ws as WaveSurfer & {
      stop?: () => void
      pause?: () => void
      setTime?: (time: number) => void
    }
    if (transport.stop) {
      transport.stop()
    } else if (transport.pause) {
      transport.pause()
    }

    let cancelled = false

    const load = async () => {
      const channelData: Float32Array[] = []
      for (let ch = 0; ch < processedBuffer.numberOfChannels; ch += 1) {
        channelData.push(processedBuffer.getChannelData(ch))
      }

      await ws.load('', channelData, processedBuffer.duration)
      if (cancelled) {
        return
      }

      transport.setTime?.(0)
      setProcessedTransportState('stop')
    }

    void load().catch(() => {
      if (!cancelled) {
        setProcessedBuffer(null)
      }
    })

    return () => {
      cancelled = true
    }
  }, [hasActiveSelection, processedBuffer])

  useEffect(() => {
    const buf = (normalizeOutput && normalizedDisplayBuffer) ? normalizedDisplayBuffer : audioBuffer
    if (!buf) {
      return
    }
    void loadBufferIntoWaveformRef.current(buf).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to render waveform.'
      setError(msg)
    })
  }, [audioBuffer, normalizedDisplayBuffer, normalizeOutput])

  useEffect(() => {
    if (!audioBuffer || !isWaveformReady) {
      return
    }
    const ws = wavesurferRef.current
    if (!ws || ws.getDuration() <= 0 || !ws.getDecodedData()) {
      return
    }
    ws.zoom(zoom)
  }, [audioBuffer, isWaveformReady, zoom])

  useEffect(() => {
    const activeRegion = regionsRef.current?.getRegions()[0]
    if (!activeRegion) {
      return
    }
    styleRegion(
      activeRegion.start,
      activeRegion.end,
      (activeRegion as { element?: HTMLElement }).element,
    )
  }, [clipFadeInMs, clipFadeOutMs, cutCrossfadeSec, loopCrossfadeSec, mode, styleRegion])

  const toggleLoopPreview = useCallback(() => {
    setLoopPreviewEnabled((prev) => {
      const next = !prev
      loopPreviewEnabledRef.current = next

      if (previewSourceRef.current) {
        previewSourceRef.current.loop = next
      }

      return next
    })
  }, [])

  const toggleProcessedLoopPreview = useCallback(() => {
    setProcessedLoopPreviewEnabled((prev) => {
      const next = !prev
      processedLoopPreviewEnabledRef.current = next

      if (processedPreviewSourceRef.current) {
        processedPreviewSourceRef.current.loop = next
      }

      return next
    })
  }, [])

  useEffect(() => {
    if (!audioBuffer || !normalizeOutput) {
      setNormalizedDisplayBuffer(null)
      return
    }
    const ctx = getAudioContext()
    const copy = copyBuffer(audioBuffer, ctx)
    normalizeBuffer(copy)
    setNormalizedDisplayBuffer(copy)
  }, [audioBuffer, normalizeOutput, getAudioContext])

  const canProcess = Boolean(audioBuffer) && !isBusy
  const hasCutUndo = undoCount > 0

  const modeHelp =
    mode === 'loop'
      ? 'Create a seamless loop by blending end into beginning.'
      : mode === 'clip'
        ? 'Export a clean clip from the selected region with optional fades.'
        : 'Remove the selected range, crossfade the seam, then continue editing.'

  const showWaveform = Boolean(audioBuffer) && isWaveformReady

  return (
    <div className="mx-auto grid w-[min(1400px,calc(100%-32px))] gap-4 py-5">
      <AppHeader message={message} error={error} />

      <main
        className={audioBuffer ? 'grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]' : 'grid gap-4'}
      >
        {audioBuffer ? (
          <ControlsPanel
            mode={mode}
            modeHelp={modeHelp}
            loopCrossfadeSec={loopCrossfadeSec}
            crossfadeMaxSec={crossfadeMaxSec}
            loopCurve={loopCurve}
            snapToZeroCrossing={snapToZeroCrossing}
            embedLoopSidecar={embedLoopSidecar}
            clipFadeInMs={clipFadeInMs}
            clipFadeOutMs={clipFadeOutMs}
            cutCrossfadeSec={cutCrossfadeSec}
            canProcess={canProcess}
            hasCutUndo={hasCutUndo}
            onModeChange={setMode}
            onLoopCrossfadeChange={setLoopCrossfadeSec}
            onLoopCurveChange={setLoopCurve}
            onSnapToZeroCrossingChange={setSnapToZeroCrossing}
            onEmbedLoopSidecarChange={setEmbedLoopSidecar}
            onClipFadeInChange={setClipFadeInMs}
            onClipFadeOutChange={setClipFadeOutMs}
            onCutCrossfadeChange={setCutCrossfadeSec}
            onWheelNudge={onWheelNudge}
            onApplyCut={applyCut}
            onUndoCut={undoCut}
            onExportWav={exportWav}
          />
        ) : null}

        <div className="grid gap-4">
          <EditorPanel
            sourceName={sourceName}
            regionStart={regionStart}
            regionEnd={regionEnd}
            audioLoaded={Boolean(audioBuffer)}
            canProcess={canProcess}
            showWaveform={showWaveform}
            waveformRef={waveformRef}
            waveColor={WAVEFORM_BASE_COLOR}
            transportState={transportState}
            loopPreviewEnabled={loopPreviewEnabled}
            normalizeOutput={normalizeOutput}
            onNormalizeOutputChange={setNormalizeOutput}
            onDrop={onDrop}
            onFileInput={onFileInput}
            onPlaySelection={() => void previewSelection()}
            onPauseSelection={pauseSelection}
            onStopPreview={stopPreview}
            onToggleLoopPreview={toggleLoopPreview}
            footerPrimaryText="Drag region handles to define selection."
          />

          {hasActiveSelection && processedBuffer ? (
            <EditorPanel
              sourceName={`${sourceName || 'Source'} (processed)`}
              regionStart={0}
              regionEnd={processedBuffer.duration}
              audioLoaded
              canProcess
              showWaveform
              waveformRef={processedWaveformRef}
              waveColor={WAVEFORM_BASE_COLOR}
              transportState={processedTransportState}
              loopPreviewEnabled={processedLoopPreviewEnabled}
              allowFileDrop={false}
              showImportCapMessage={false}
              onPlaySelection={() => void playProcessedPreview()}
              onPauseSelection={pauseProcessedPreview}
              onStopPreview={stopProcessedPreview}
              onToggleLoopPreview={toggleProcessedLoopPreview}
              subtitleText="Processed waveform from current selection."
              footerPrimaryText=""
            />
          ) : null}
        </div>
      </main>
    </div>
  )
}

export default App
