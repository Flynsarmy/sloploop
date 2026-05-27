import type { ChangeEvent, CSSProperties, DragEvent, RefObject } from 'react'
import { Pause, Play, Repeat, Square } from 'lucide-react'

type TransportState = 'play' | 'pause' | 'stop'

type EditorPanelProps = {
  sourceName: string
  regionStart: number
  regionEnd: number
  audioLoaded: boolean
  canProcess: boolean
  showWaveform: boolean
  waveformRef: RefObject<HTMLDivElement | null>
  waveColor: string
  transportState: TransportState
  loopPreviewEnabled: boolean
  onDrop: (event: DragEvent<HTMLDivElement>) => void | Promise<void>
  onFileInput: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>
  onPlaySelection: () => void
  onPauseSelection: () => void
  onStopPreview: () => void
  onToggleLoopPreview: () => void
}

function EditorPanel({
  sourceName,
  regionStart,
  regionEnd,
  audioLoaded,
  canProcess,
  showWaveform,
  waveformRef,
  waveColor,
  transportState,
  loopPreviewEnabled,
  onDrop,
  onFileInput,
  onPlaySelection,
  onPauseSelection,
  onStopPreview,
  onToggleLoopPreview,
}: EditorPanelProps) {
  const controlButtonClass =
    'inline-flex h-10 w-10 items-center justify-center rounded-none border bg-control-bg transition disabled:cursor-not-allowed disabled:opacity-50'

  const getTransportClass = (isActive: boolean) =>
    `${controlButtonClass} ${isActive ? 'border-accent-orange text-accent-orange' : 'border-panel-border text-white hover:border-app-muted'}`

  return (
    <section className="grid min-h-0 gap-3 rounded-2xl border border-panel-border bg-panel-bg p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="m-0 text-[22px] font-semibold">{sourceName || 'No source loaded'}</h2>
          <p className="mt-1 mb-0 text-[13px] text-app-muted">Space = preview selection, E = export WAV</p>
        </div>
        <div className="grid gap-1 text-[13px] text-app-muted md:text-right">
          <span>Start: {regionStart.toFixed(3)}s</span>
          <span>End: {regionEnd.toFixed(3)}s</span>
        </div>
      </div>

      <div
        className="relative flex min-h-[260px] overflow-hidden rounded-xl border border-panel-border bg-panel-bg"
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
      >
        <div
          ref={waveformRef}
          className={audioLoaded ? 'waveform min-h-[260px] w-full' : 'waveform hidden min-h-[260px] w-full'}
          style={{ '--waveform-base-color': waveColor } as CSSProperties}
        />
        {!audioLoaded ? (
          <div className="m-3 grid min-h-[calc(260px-24px)] w-full flex-1 content-center justify-items-center gap-1 border border-dashed border-panel-border px-4 py-4 text-center text-app-muted">
            <p className="m-0">Drag and drop WAV, OGG, MP3, AIFF</p>
            <p className="m-0">Supported: WAV, OGG, MP3, AIFF, AIF</p>
            <label className="mt-2.5 inline-flex min-w-40 items-center justify-center rounded-none border border-panel-border bg-control-bg px-3.5 py-[11px] font-bold text-white transition hover:border-app-muted">
              <input
                type="file"
                accept="audio/*,.aiff,.aif,.wav,.ogg,.mp3"
                onChange={onFileInput}
                className="hidden"
              />
              Open File
            </label>
          </div>
        ) : null}
      </div>

      {showWaveform ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            title="Play selection"
            aria-label="Play selection"
            className={getTransportClass(transportState === 'play')}
            onClick={onPlaySelection}
            disabled={!canProcess}
          >
            <Play size={17} />
          </button>
          <button
            type="button"
            title="Pause preview"
            aria-label="Pause preview"
            className={getTransportClass(transportState === 'pause')}
            onClick={onPauseSelection}
            disabled={!canProcess}
          >
            <Pause size={17} />
          </button>
          <button
            type="button"
            title="Stop preview"
            aria-label="Stop preview"
            className={getTransportClass(transportState === 'stop')}
            onClick={onStopPreview}
            disabled={!canProcess}
          >
            <Square size={17} />
          </button>
          <button
            type="button"
            title={loopPreviewEnabled ? 'Loop on' : 'Loop off'}
            aria-label={loopPreviewEnabled ? 'Disable loop preview' : 'Enable loop preview'}
            aria-pressed={loopPreviewEnabled}
            className={getTransportClass(loopPreviewEnabled)}
            onClick={onToggleLoopPreview}
            disabled={!canProcess}
          >
            <Repeat size={17} />
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3 text-xs text-app-muted">
        <span>Drag region handles to define selection.</span>
        <span>Mouse wheel over numeric fields for fine adjustments.</span>
        <span>10-minute import cap to keep browser memory stable.</span>
      </div>
    </section>
  )
}

export default EditorPanel