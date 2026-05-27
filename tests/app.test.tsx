import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'

type WaveSurferHandler = (...args: unknown[]) => void

type FakeWaveSurfer = {
  loadBlob: ReturnType<typeof vi.fn>
  getDuration: ReturnType<typeof vi.fn>
  zoom: ReturnType<typeof vi.fn>
  play: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  un: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
}

const wsHandlers = new Map<string, WaveSurferHandler>()

const fakeWaveSurfer: FakeWaveSurfer = {
  loadBlob: vi.fn(async () => undefined),
  getDuration: vi.fn(() => 2.5),
  zoom: vi.fn(),
  play: vi.fn(async () => undefined),
  on: vi.fn((event: string, handler: WaveSurferHandler) => {
    wsHandlers.set(event, handler)
  }),
  un: vi.fn((event: string) => {
    wsHandlers.delete(event)
  }),
  destroy: vi.fn(),
}

const fakeRegions = {
  enableDragSelection: vi.fn(),
  on: vi.fn(),
  getRegions: vi.fn(() => [] as Array<{ id: string; remove: () => void }>),
  addRegion: vi.fn(),
}

vi.mock('wavesurfer.js', () => {
  return {
    default: {
      create: vi.fn(() => fakeWaveSurfer),
    },
  }
})

vi.mock('wavesurfer.js/dist/plugins/regions.esm.js', () => {
  return {
    default: {
      create: vi.fn(() => fakeRegions),
    },
  }
})

class MockAudioContext {
  state: AudioContextState = 'running'
  destination = {} as AudioDestinationNode

  async resume(): Promise<void> {
    return undefined
  }

  createBufferSource(): AudioBufferSourceNode {
    return {
      buffer: null,
      connect: () => undefined,
      disconnect: () => undefined,
      start: () => undefined,
      stop: () => undefined,
      onended: null,
    } as unknown as AudioBufferSourceNode
  }

  async decodeAudioData(): Promise<AudioBuffer> {
    const sampleRate = 48000
    const length = sampleRate * 2
    const channel = new Float32Array(length)
    channel.fill(0.1)

    const buffer = {
      numberOfChannels: 1,
      sampleRate,
      length,
      duration: length / sampleRate,
      getChannelData: () => channel,
      copyToChannel: () => undefined,
    }

    return buffer as unknown as AudioBuffer
  }

  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
    const perChannel = Array.from({ length: channels }, () => new Float32Array(length))
    return {
      numberOfChannels: channels,
      sampleRate,
      length,
      duration: length / sampleRate,
      getChannelData: (ch: number) => perChannel[ch],
      copyToChannel: (source: Float32Array, ch: number) => {
        perChannel[ch].set(source)
      },
    } as unknown as AudioBuffer
  }
}

describe('Sloploop', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    wsHandlers.clear()
    ;(globalThis as unknown as { AudioContext: typeof AudioContext }).AudioContext =
      MockAudioContext as unknown as typeof AudioContext
  })

  it('renders file input and drag-drop prompt on initial load', () => {
    render(<App />)

    expect(screen.getByText('Open File')).toBeInTheDocument()
    expect(screen.getByText('Drag and drop WAV, OGG, MP3, AIFF')).toBeInTheDocument()
  })

  it('loads the MP3 fixture from assets through the file input', async () => {
    render(<App />)

    const mp3Path = resolve(process.cwd(), 'assets', 'car-idle-106494.mp3')
    const mp3Bytes = readFileSync(mp3Path)
    const mp3File = new File([mp3Bytes], 'car-idle-106494.mp3', { type: 'audio/mpeg' })

    const input = screen.getAllByLabelText('Open File')[0] as HTMLInputElement
    await userEvent.upload(input, mp3File)

    await waitFor(() => {
      expect(screen.getByText(/Loaded car-idle-106494\.mp3/)).toBeInTheDocument()
    })

    expect(fakeWaveSurfer.loadBlob).toHaveBeenCalledTimes(1)
    expect(fakeWaveSurfer.zoom).toHaveBeenCalled()
    expect(screen.queryByText('No audio loaded')).not.toBeInTheDocument()
  })
})
