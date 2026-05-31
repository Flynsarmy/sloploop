import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/preact'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'

type WaveSurferHandler = (...args: unknown[]) => void

type FakeWaveSurfer = {
  load: ReturnType<typeof vi.fn>
  getDuration: ReturnType<typeof vi.fn>
  getDecodedData: ReturnType<typeof vi.fn>
  zoom: ReturnType<typeof vi.fn>
  play: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  un: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
}

const wsHandlers = new Map<string, WaveSurferHandler>()
const regionHandlers = new Map<string, WaveSurferHandler>()

const fakeWaveSurfer: FakeWaveSurfer = {
  load: vi.fn(async () => undefined),
  getDuration: vi.fn(() => 2.5),
  getDecodedData: vi.fn(() => ({ samples: [] })),
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
  on: vi.fn((event: string, handler: WaveSurferHandler) => {
    regionHandlers.set(event, handler)
  }),
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

vi.mock('lucide-react', () => ({
  Play: () => <span>play</span>,
  Pause: () => <span>pause</span>,
  Square: () => <span>square</span>,
  Repeat: () => <span>repeat</span>,
}))

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadMp3File() {
  const mp3Path = resolve(process.cwd(), 'assets', 'car-idle-106494.mp3')
  const mp3Bytes = readFileSync(mp3Path)
  const mp3File = new File([mp3Bytes], 'car-idle-106494.mp3', { type: 'audio/mpeg' })
  const input = screen.getAllByLabelText('Open File')[0] as HTMLInputElement
  await userEvent.upload(input, mp3File)
  await waitFor(() => {
    expect(screen.getByText(/Loaded car-idle-106494\.mp3/)).toBeInTheDocument()
  })
}

/** Wait for the waveform transport controls to appear (isWaveformReady = true). */
async function waitForWaveformReady() {
  await waitFor(() => {
    expect(screen.getAllByRole('button', { name: 'Play selection' }).length).toBeGreaterThan(0)
  })
}

/** Simulate a region-created event at the given time range. */
function simulateRegionCreated(start: number, end: number) {
  const element = document.createElement('div')
  const region = { id: 'test-region', start, end, remove: vi.fn(), element }
  regionHandlers.get('region-created')?.(region)
}

/** Simulate a region-updated event at the given time range. */
function simulateRegionUpdated(start: number, end: number) {
  const element = document.createElement('div')
  const region = { id: 'test-region', start, end, remove: vi.fn(), element }
  regionHandlers.get('region-updated')?.(region)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Sloploop', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    wsHandlers.clear()
    regionHandlers.clear()
    ;(globalThis as unknown as { AudioContext: typeof AudioContext }).AudioContext =
      MockAudioContext as unknown as typeof AudioContext
  })

  // --- Initial render ---

  it('renders file input and drag-drop prompt on initial load', () => {
    render(<App />)

    expect(screen.getByText('Open File')).toBeInTheDocument()
    expect(screen.getByText('Supported: WAV, OGG, MP3, AIFF, AIF')).toBeInTheDocument()
    expect(screen.queryByText(/^Start:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^End:/)).not.toBeInTheDocument()
  })

  // --- File loading ---

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

    await waitFor(() => {
      expect(fakeWaveSurfer.load).toHaveBeenCalledTimes(1)
    })
    expect(fakeWaveSurfer.zoom).toHaveBeenCalled()
    expect(screen.queryByText('No audio loaded')).not.toBeInTheDocument()
  })

  it('loads a file via drag and drop', async () => {
    render(<App />)

    const mp3Path = resolve(process.cwd(), 'assets', 'car-idle-106494.mp3')
    const mp3Bytes = readFileSync(mp3Path)
    const mp3File = new File([mp3Bytes], 'dropped.mp3', { type: 'audio/mpeg' })

    const dropTarget = screen.getByText('Drop a file to get started.')
    const dropEvent = createEvent.drop(dropTarget)
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { files: [mp3File] },
    })
    fireEvent(dropTarget, dropEvent)

    await waitFor(() => {
      expect(screen.getByText(/Loaded dropped\.mp3/)).toBeInTheDocument()
    })
  })

  it('shows an error when the file exceeds the 10-minute limit', async () => {
    const longCtx = new MockAudioContext()
    const longDuration = 601
    const longLength = 48000 * longDuration
    ;(longCtx as unknown as { decodeAudioData: () => Promise<AudioBuffer> }).decodeAudioData =
      async () =>
        ({
          numberOfChannels: 1,
          sampleRate: 48000,
          length: longLength,
          duration: longDuration,
          getChannelData: () => new Float32Array(longLength),
          copyToChannel: () => undefined,
        }) as unknown as AudioBuffer

    ;(globalThis as unknown as { AudioContext: typeof AudioContext }).AudioContext =
      (function LongAudioContext() { return longCtx }) as unknown as typeof AudioContext

    render(<App />)

    const mp3File = new File([new Uint8Array([0, 1, 2])], 'toolong.mp3', { type: 'audio/mpeg' })
    const input = screen.getAllByLabelText('Open File')[0] as HTMLInputElement
    await userEvent.upload(input, mp3File)

    await waitFor(() => {
      expect(screen.getByText(/10-minute limit/)).toBeInTheDocument()
    })
  })

  it('shows an error when decoding fails', async () => {
    const failCtx = new MockAudioContext()
    ;(failCtx as unknown as { decodeAudioData: () => Promise<AudioBuffer> }).decodeAudioData =
      async () => {
        throw new Error('Invalid audio data')
      }

    ;(globalThis as unknown as { AudioContext: typeof AudioContext }).AudioContext =
      (function FailAudioContext() { return failCtx }) as unknown as typeof AudioContext

    render(<App />)

    const badFile = new File([new Uint8Array([0, 1, 2])], 'bad.mp3', { type: 'audio/mpeg' })
    const input = screen.getAllByLabelText('Open File')[0] as HTMLInputElement
    await userEvent.upload(input, badFile)

    await waitFor(() => {
      expect(screen.getByText('Invalid audio data')).toBeInTheDocument()
    })
  })

  // --- Post-load UI ---

  it('shows mode tabs after loading a file', async () => {
    render(<App />)
    await loadMp3File()

    expect(screen.getByText('LOOP')).toBeInTheDocument()
    expect(screen.getByText('CLIP')).toBeInTheDocument()
    expect(screen.getByText('CUT')).toBeInTheDocument()
  })

  it('shows Loop settings by default', async () => {
    render(<App />)
    await loadMp3File()

    expect(screen.getByText('Loop Settings')).toBeInTheDocument()
  })

  it('updates mode help copy when switching tabs', async () => {
    render(<App />)
    await loadMp3File()

    expect(
      screen.getByText('Create a seamless loop by blending end into beginning.'),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByText('CLIP'))
    expect(
      screen.getByText('Export a clean clip from the selected region with optional fades.'),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByText('CUT'))
    expect(
      screen.getByText('Remove the selected range, crossfade the seam, then continue editing.'),
    ).toBeInTheDocument()
  })

  it('shows Clip settings after switching to CLIP mode', async () => {
    render(<App />)
    await loadMp3File()

    await userEvent.click(screen.getByText('CLIP'))

    expect(screen.getByText('Clip Settings')).toBeInTheDocument()
    expect(screen.queryByText('Loop Settings')).not.toBeInTheDocument()
  })

  it('shows Cut settings after switching to CUT mode', async () => {
    render(<App />)
    await loadMp3File()

    await userEvent.click(screen.getByText('CUT'))

    await waitFor(() => expect(screen.getByText('Cut Settings')).toBeInTheDocument())
    expect(screen.queryByText('Loop Settings')).not.toBeInTheDocument()
  })

  it('shows transport controls once the waveform is ready', async () => {
    render(<App />)
    await loadMp3File()
    await waitForWaveformReady()

    const pauseButton = screen
      .getAllByRole('button', { name: 'Pause preview' })
      .find((button) => !(button as HTMLButtonElement).disabled)
    const stopButton = screen
      .getAllByRole('button', { name: 'Stop preview' })
      .find((button) => !(button as HTMLButtonElement).disabled)
    const loopButton = screen
      .getAllByRole('button', { name: 'Disable loop preview' })
      .find((button) => !(button as HTMLButtonElement).disabled)

    expect(pauseButton).toBeInTheDocument()
    expect(stopButton).toBeInTheDocument()
    expect(loopButton).toBeInTheDocument()
  })

  // --- Transport / playback ---

  it('loop preview button starts pressed and toggles off when clicked', async () => {
    render(<App />)
    await loadMp3File()
    await waitForWaveformReady()

    const loopBtn = screen
      .getAllByRole('button', { name: 'Disable loop preview' })
      .find((button) => !(button as HTMLButtonElement).disabled) as HTMLButtonElement
    expect(loopBtn).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(loopBtn)

    await waitFor(() => {
      expect(
        screen
          .getAllByRole('button', { name: 'Enable loop preview' })
          .some((button) => !(button as HTMLButtonElement).disabled),
      ).toBe(true)
    })
    const updatedLoopButton = screen
      .getAllByRole('button', { name: 'Enable loop preview' })
      .find((button) => !(button as HTMLButtonElement).disabled)
    expect(updatedLoopButton).toHaveAttribute('aria-pressed', 'false')
  })

  // --- Normalize output ---

  it('normalize output checkbox is checked by default and can be toggled', async () => {
    render(<App />)
    await loadMp3File()
    await waitForWaveformReady()

    const checkbox = screen.getByLabelText('Normalize') as HTMLInputElement
    expect(checkbox.checked).toBe(true)

    await userEvent.click(checkbox)
    expect(checkbox.checked).toBe(false)

    await userEvent.click(checkbox)
    expect(checkbox.checked).toBe(true)
  })

  // --- Loop mode settings ---

  it('snap to zero crossing checkbox is checked by default and can be toggled', async () => {
    render(<App />)
    await loadMp3File()

    const checkbox = screen.getByLabelText(
      'Snap region bounds to nearest zero crossing',
    ) as HTMLInputElement
    expect(checkbox.checked).toBe(true)

    await userEvent.click(checkbox)
    expect(checkbox.checked).toBe(false)
  })

  it('embed loop sidecar JSON checkbox is unchecked by default and can be toggled', async () => {
    render(<App />)
    await loadMp3File()

    const checkbox = screen.getByLabelText(
      'Export loop sidecar JSON metadata',
    ) as HTMLInputElement
    expect(checkbox.checked).toBe(false)

    await userEvent.click(checkbox)
    expect(checkbox.checked).toBe(true)
  })

  it('loop curve select defaults to smoothstep and can be changed to equal-power', async () => {
    render(<App />)
    await loadMp3File()

    const select = screen.getByDisplayValue('Smoothstep') as HTMLSelectElement
    expect(select.value).toBe('smoothstep')

    await userEvent.selectOptions(select, 'equal-power')
    expect(select.value).toBe('equal-power')
  })

  // --- Cut mode ---

  it('Apply Cut button is rendered in cut mode', async () => {
    render(<App />)
    await loadMp3File()

    await userEvent.click(screen.getByText('CUT'))

    expect(screen.getByText('Apply Cut')).toBeInTheDocument()
  })

  it('Apply Cut shows an error when no inner selection is set', async () => {
    render(<App />)
    await loadMp3File()

    await userEvent.click(screen.getByText('CUT'))
    await userEvent.click(screen.getByText('Apply Cut'))

    await waitFor(() => {
      expect(
        screen.getByText(/cut selection must leave audio on both sides/i),
      ).toBeInTheDocument()
    })
  })

  it('Apply Cut shows an error when no inner selection is set and zero-crossing snap is off', async () => {
    render(<App />)
    await loadMp3File()

    await userEvent.click(screen.getByText('CUT'))
    await userEvent.click(screen.getByLabelText('Snap region bounds to nearest zero crossing'))
    await userEvent.click(screen.getByText('Apply Cut'))

    await waitFor(() => {
      expect(
        screen.getByText(/cut selection must leave audio on both sides/i),
      ).toBeInTheDocument()
    })
  })

  it('Undo Cut button is disabled when there is nothing to undo', async () => {
    render(<App />)
    await loadMp3File()

    await userEvent.click(screen.getByText('CUT'))

    expect(screen.getByText('Undo Cut')).toBeDisabled()
  })

  it('Apply Cut then Undo Cut restores the buffer and shows success message', async () => {
    render(<App />)
    await loadMp3File()
    const sourcePanel = screen.getByRole('heading', { name: /car-idle-106494/i }).closest('section')

    await userEvent.click(screen.getByText('CUT'))
    await waitFor(() => expect(screen.getByText('Cut Settings')).toBeInTheDocument())

    // Create a mid-file selection so the cut leaves audio on both sides.
    // Use waitFor on the start-time display so we know the state actually settled.
    simulateRegionCreated(0.5, 1.5)
    await waitFor(() => {
      expect(sourcePanel?.textContent).toContain('Start:')
      expect(sourcePanel?.textContent).toContain('0.500')
    })

    await userEvent.click(screen.getByText('Apply Cut'))

    await waitFor(() => {
      expect(screen.getByText('Cut applied to source. You can undo if needed.')).toBeInTheDocument()
    })

    await waitFor(() => expect(screen.getByText('Undo Cut')).not.toBeDisabled())

    await userEvent.click(screen.getByText('Undo Cut'))

    await waitFor(() => {
      expect(screen.getByText('Undo successful.')).toBeInTheDocument()
    })
  })

  // --- Export ---

  it('Export WAV button is rendered after file load', async () => {
    render(<App />)
    await loadMp3File()

    expect(screen.getByText('Export WAV')).toBeInTheDocument()
  })

  it('Export WAV triggers a file download', async () => {
    const createObjectURL = vi.fn(() => 'blob:test-url')
    const revokeObjectURL = vi.fn()
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)

    globalThis.URL.createObjectURL = createObjectURL
    globalThis.URL.revokeObjectURL = revokeObjectURL

    render(<App />)
    await loadMp3File()

    await userEvent.click(screen.getByText('Export WAV'))

    expect(createObjectURL).toHaveBeenCalled()
    expect(anchorClickSpy).toHaveBeenCalled()

    await waitFor(() => {
      expect(screen.getByText(/Exported LOOP as WAV/)).toBeInTheDocument()
    })

    anchorClickSpy.mockRestore()
  })

  it('Export WAV in loop mode with sidecar option triggers two downloads', async () => {
    const createObjectURL = vi.fn(() => 'blob:test-url')
    const revokeObjectURL = vi.fn()
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)

    globalThis.URL.createObjectURL = createObjectURL
    globalThis.URL.revokeObjectURL = revokeObjectURL

    render(<App />)
    await loadMp3File()

    // Enable sidecar JSON export
    const sidecarCheckbox = screen.getByLabelText('Export loop sidecar JSON metadata')
    await userEvent.click(sidecarCheckbox)

    await userEvent.click(screen.getByText('Export WAV'))

    // One click for the WAV, one for the sidecar JSON
    expect(anchorClickSpy).toHaveBeenCalledTimes(2)

    anchorClickSpy.mockRestore()
  })

  it('Export WAV in clip mode reports CLIP export', async () => {
    const createObjectURL = vi.fn(() => 'blob:test-url')
    const revokeObjectURL = vi.fn()
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)

    globalThis.URL.createObjectURL = createObjectURL
    globalThis.URL.revokeObjectURL = revokeObjectURL

    render(<App />)
    await loadMp3File()
    await userEvent.click(screen.getByText('CLIP'))

    await userEvent.click(screen.getByText('Export WAV'))

    expect(anchorClickSpy).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.getByText('Exported CLIP as WAV')).toBeInTheDocument()
    })

    anchorClickSpy.mockRestore()
  })

  it('Export WAV in cut mode reports CUT export', async () => {
    const createObjectURL = vi.fn(() => 'blob:test-url')
    const revokeObjectURL = vi.fn()
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)

    globalThis.URL.createObjectURL = createObjectURL
    globalThis.URL.revokeObjectURL = revokeObjectURL

    render(<App />)
    await loadMp3File()
    await userEvent.click(screen.getByText('CUT'))

    await userEvent.click(screen.getByText('Export WAV'))

    expect(anchorClickSpy).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.getByText('Exported CUT as WAV')).toBeInTheDocument()
    })

    anchorClickSpy.mockRestore()
  })

  // --- Region / selection ---

  it('shows a processed waveform panel after a region is created', async () => {
    render(<App />)
    await loadMp3File()
    await waitForWaveformReady()

    simulateRegionCreated(0.5, 1.5)

    await waitFor(() => {
      expect(screen.getByText('Processed waveform from current selection.')).toBeInTheDocument()
    })
  })

  it('shows a prompt to select a region before the processed preview is available', async () => {
    render(<App />)
    await loadMp3File()
    await waitForWaveformReady()

    expect(screen.getByText('Select a region to preview the result.')).toBeInTheDocument()
  })

  it('updates the processed panel title to match the current mode', async () => {
    render(<App />)
    await loadMp3File()
    await waitForWaveformReady()

    const sourcePanel = screen.getByRole('heading', { name: /car-idle-106494/i }).closest('section')
    if (!sourcePanel) {
      throw new Error('Source panel not found')
    }

    expect(within(sourcePanel).queryByRole('heading', { name: 'Loop Result' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Loop Result' })).toBeInTheDocument()

    await userEvent.click(screen.getByText('CLIP'))
    expect(screen.getByRole('heading', { name: 'Clip Result' })).toBeInTheDocument()

    await userEvent.click(screen.getByText('CUT'))
    expect(screen.getByRole('heading', { name: 'Cut Result' })).toBeInTheDocument()
  })

  it('sets the crossfade slider max to 45% of the selection and clamps the value to 200ms', async () => {
    render(<App />)
    await loadMp3File()
    await waitForWaveformReady()

    simulateRegionCreated(0.25, 2.5)

    const slider = screen.getByRole('slider') as HTMLInputElement
    await waitFor(() => {
      expect(Number(slider.max)).toBeCloseTo(1.0125, 5)
      expect(slider.value).toBe('0.2')
    })
  })

  it('keeps the crossfade value when resizing a region and only clamps it to the new bounds', async () => {
    render(<App />)
    await loadMp3File()
    await waitForWaveformReady()

    simulateRegionCreated(0.25, 1.25)

    const slider = screen.getByRole('slider') as HTMLInputElement
    await waitFor(() => {
      expect(slider.value).toBe('0.1')
    })

    simulateRegionUpdated(0.25, 2.5)

    await waitFor(() => {
      expect(slider.value).toBe('0.1')
    })
  })

  it('clamps the existing crossfade when a resized region becomes too small for it', async () => {
    render(<App />)
    await loadMp3File()
    await waitForWaveformReady()

    simulateRegionCreated(0.25, 2.5)

    const slider = screen.getByRole('slider') as HTMLInputElement
    await waitFor(() => {
      expect(slider.value).toBe('0.2')
    })

    simulateRegionUpdated(0.25, 0.4)

    await waitFor(() => {
      expect(Number(slider.value)).toBeCloseTo(0.0675, 4)
    })
  })

  it('lets the crossfade seconds value be edited directly and committed with Enter', async () => {
    render(<App />)
    await loadMp3File()
    await waitForWaveformReady()

    const crossfadeButton = screen.getByRole('button', { name: '0.120 s' })
    await userEvent.click(crossfadeButton)

    const input = screen.getByRole('spinbutton') as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.type(input, '0.789')
    await userEvent.keyboard('{Enter}')

    await waitFor(() => {
      expect(screen.getByText('0.789 s')).toBeInTheDocument()
      expect(screen.getByRole('slider')).toHaveValue('0.789')
    })
  })

  it('displays selection start and end times in the editor header', async () => {
    render(<App />)
    await loadMp3File()
    await waitForWaveformReady()
    const sourcePanel = screen.getByRole('heading', { name: /car-idle-106494/i }).closest('section')

    simulateRegionCreated(0.25, 1.75)

    await waitFor(() => {
      expect(sourcePanel?.textContent).toContain('Start:')
      expect(sourcePanel?.textContent).toContain('0.250')
      expect(sourcePanel?.textContent).toContain('End:')
      expect(sourcePanel?.textContent).toContain('1.750')
    })
  })
})
