import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, WheelEvent as ReactWheelEvent } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import AppHeader from './components/AppHeader'
import ControlsPanel from './components/ControlsPanel'
import EditorPanel from './components/EditorPanel'
import type { LoopCurve, Mode } from './types/app'
import './App.css'

declare global {
  interface Window {
    wavesurfer: WaveSurfer | null
  }
}

const MAX_FILE_DURATION_SEC = 600
const WAVEFORM_BASE_COLOR = '#4A9ABA'
const CROSSFADE_COLOR = 'var(--accent-orange)'
const SELECTION_FILL_COLOR = 'rgba(50, 50, 50, 0.45)'
const SELECTION_CROSSFADE_FILL = 'color-mix(in srgb, var(--accent-orange) 72%, transparent)'
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

  const [isPlayingPreview, setIsPlayingPreview] = useState(false)
  const [undoCount, setUndoCount] = useState(0)
  const [isWaveformReady, setIsWaveformReady] = useState(false)

  const waveformRef = useRef<HTMLDivElement | null>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const regionsRef = useRef<RegionsPlugin | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const undoRef = useRef<AudioBuffer[]>([])
  const zoomRef = useRef(zoom)
  const styleRegionRef = useRef<(start: number, end: number, element?: HTMLElement | null) => void>(
    () => {},
  )
  const applyWaveColorsRef = useRef<(selectionActive: boolean) => void>(() => {})
  const clearSelectionRef = useRef<(newDuration?: number) => void>(() => {})
  const applySelectionCrossfadePresetRef = useRef<(start: number, end: number) => void>(() => {})

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

  const stopPreview = useCallback(() => {
    if (previewSourceRef.current) {
      previewSourceRef.current.onended = null
      previewSourceRef.current.stop()
      previewSourceRef.current.disconnect()
      previewSourceRef.current = null
    }
    setIsPlayingPreview(false)
  }, [])

  const playBuffer = useCallback(
    async (buffer: AudioBuffer) => {
      stopPreview()
      const ctx = getAudioContext()
      if (ctx.state !== 'running') {
        await ctx.resume()
      }

      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
      source.onended = () => {
        previewSourceRef.current = null
        setIsPlayingPreview(false)
      }
      previewSourceRef.current = source
      source.start()
      setIsPlayingPreview(true)
    },
    [getAudioContext, stopPreview],
  )

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

          const startValue = segment[i]
          const endValue = segment[segment.length - crossfadeSamples + i]
          channel[i] = startValue * outGain + endValue * inGain
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
      clearSelectionRef.current(buffer.duration)
      setIsWaveformReady(true)
    },
    [],
  )

  const decodeFile = useCallback(
    async (file: File) => {
      setError('')
      setIsBusy(true)
      setIsWaveformReady(false)
      stopPreview()
      clearSelectionRef.current(0)
      setAudioBuffer(null)
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
    [getAudioContext, stopPreview],
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
    if (!audioBuffer) {
      return
    }

    const ctx = getAudioContext()
    const { startSample, endSample } = ensureSelectionSamples(audioBuffer, false)
    const length = Math.max(1, endSample - startSample)
    const out = ctx.createBuffer(audioBuffer.numberOfChannels, length, audioBuffer.sampleRate)
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch += 1) {
      out.copyToChannel(audioBuffer.getChannelData(ch).subarray(startSample, endSample), ch)
    }

    await playBuffer(out)
  }, [audioBuffer, ensureSelectionSamples, getAudioContext, playBuffer])

  const previewProcessed = useCallback(async () => {
    if (!audioBuffer) {
      return
    }
    setError('')
    try {
      const out = processByMode(audioBuffer)
      await playBuffer(out)
      setMessage(`Previewing ${mode.toUpperCase()} output`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed.')
    }
  }, [audioBuffer, mode, playBuffer, processByMode])

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

    const regions = RegionsPlugin.create()
    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: WAVEFORM_BASE_COLOR,
      progressColor: WAVEFORM_BASE_COLOR,
      cursorWidth: 0,
      height: 220,
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
      return
    }
    const scrollContainer = wrapper.parentElement instanceof HTMLElement ? wrapper.parentElement : wrapper

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
      applySelectionCrossfadePresetRef.current(current.start, current.end)
      styleRegionRef.current(current.start, current.end, (current as { element?: HTMLElement }).element)
      applyWaveColorsRef.current(true)
      syncRegion(current.start, current.end)
    })

    regions.on('region-updated', (region) => {
      applySelectionCrossfadePresetRef.current(region.start, region.end)
      styleRegionRef.current(region.start, region.end, (region as { element?: HTMLElement }).element)
      applyWaveColorsRef.current(true)
      syncRegion(region.start, region.end)
    })

    regions.on('region-removed', () => {
      const active = regions.getRegions().length > 0
      applyWaveColorsRef.current(active)
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
      setIsPlayingPreview(false)
    })

    ws.on('finish', () => {
      setIsPlayingPreview(false)
    })

    return () => {
      stopPreview()
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
  }, [stopPreview])

  useEffect(() => {
    if (!audioBuffer) {
      return
    }
    void loadBufferIntoWaveform(audioBuffer).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to render waveform.'
      setError(msg)
    })
  }, [audioBuffer, loadBufferIntoWaveform])

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

  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }

      if (event.code === 'Space') {
        event.preventDefault()
        void previewSelection()
      }
      if (event.key.toLowerCase() === 'e') {
        event.preventDefault()
        exportWav()
      }
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [exportWav, previewSelection])

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
    <div className="app-shell">
      <AppHeader message={message} error={error} />

      <main className={`workspace${audioBuffer ? '' : ' workspace--empty'}`}>
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
            normalizeOutput={normalizeOutput}
            canProcess={canProcess}
            hasCutUndo={hasCutUndo}
            isPlayingPreview={isPlayingPreview}
            onModeChange={setMode}
            onLoopCrossfadeChange={setLoopCrossfadeSec}
            onLoopCurveChange={setLoopCurve}
            onSnapToZeroCrossingChange={setSnapToZeroCrossing}
            onEmbedLoopSidecarChange={setEmbedLoopSidecar}
            onClipFadeInChange={setClipFadeInMs}
            onClipFadeOutChange={setClipFadeOutMs}
            onCutCrossfadeChange={setCutCrossfadeSec}
            onNormalizeOutputChange={setNormalizeOutput}
            onWheelNudge={onWheelNudge}
            onApplyCut={applyCut}
            onUndoCut={undoCut}
            onPreviewSelection={() => void previewSelection()}
            onPreviewProcessed={() => void previewProcessed()}
            onStopPreview={stopPreview}
            onExportWav={exportWav}
          />
        ) : null}

        <EditorPanel
          sourceName={sourceName}
          regionStart={regionStart}
          regionEnd={regionEnd}
          audioLoaded={Boolean(audioBuffer)}
          showWaveform={showWaveform}
          waveformRef={waveformRef}
          waveColor={WAVEFORM_BASE_COLOR}
          onDrop={onDrop}
          onFileInput={onFileInput}
        />
      </main>
    </div>
  )
}

export default App
