import type { ChangeEvent, CSSProperties, DragEvent, RefObject } from 'react'
import { Pause, Play, Repeat, Square } from 'lucide-react'

type TransportState = 'play' | 'pause' | 'stop'

type EditorPanelProps = {
  sourceName: string
  subtitleText?: string
  regionStart: number
  regionEnd: number
  audioLoaded: boolean
  canProcess: boolean
  showWaveform: boolean
  waveformRef: RefObject<HTMLDivElement | null>
  waveColor: string
  transportState: TransportState
  loopPreviewEnabled: boolean
  allowFileDrop?: boolean
  showImportCapMessage?: boolean
  footerPrimaryText?: string
  footerSecondaryText?: string
  onDrop?: (event: DragEvent<HTMLDivElement>) => void | Promise<void>
  onFileInput?: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>
  normalizeOutput?: boolean
  onNormalizeOutputChange?: (checked: boolean) => void
  onPlaySelection: () => void
  onPauseSelection: () => void
  onStopPreview: () => void
  onToggleLoopPreview: () => void
}

function EditorPanel({
  sourceName,
  subtitleText,
  regionStart,
  regionEnd,
  audioLoaded,
  canProcess,
  showWaveform,
  waveformRef,
  waveColor,
  transportState,
  loopPreviewEnabled,
  allowFileDrop = true,
  showImportCapMessage = true,
  footerPrimaryText = 'Drag region handles to define selection.',
  footerSecondaryText,
  normalizeOutput,
  onNormalizeOutputChange,
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
          {subtitleText ? <p className="mt-1 mb-0 text-[13px] text-app-muted">{subtitleText}</p> : null}
        </div>
        <div className="grid gap-1 text-[13px] text-app-muted md:text-right">
          <span>Start: {regionStart.toFixed(3)}s</span>
          <span>End: {regionEnd.toFixed(3)}s</span>
        </div>
      </div>

      <div
        className="relative flex overflow-hidden rounded-xl border border-panel-border bg-panel-bg"
        onDragOver={allowFileDrop ? (event) => event.preventDefault() : undefined}
        onDrop={allowFileDrop && onDrop ? onDrop : undefined}
      >
        <div
          ref={waveformRef}
          className={audioLoaded ? 'waveform h-[110px] w-full' : 'waveform hidden h-[110px] w-full'}
          style={{ '--waveform-base-color': waveColor } as CSSProperties}
        />
        {!audioLoaded && allowFileDrop ? (
          <div className="m-3 grid min-h-[calc(110px-24px)] w-full flex-1 content-center justify-items-center gap-1 border border-dashed border-panel-border px-4 py-4 text-center text-app-muted">
            <p className="m-0">Drop a file to get started.</p>
            <p className="m-0">Supported: WAV, OGG, MP3, AIFF, AIF</p>
            {showImportCapMessage ? <p className="m-0">10-minute import cap to keep browser memory stable.</p> : null}
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
          {onNormalizeOutputChange !== undefined ? (
            <label className="ml-1 inline-flex cursor-pointer select-none items-center gap-2 text-[13px] text-app-muted">
              <input
                type="checkbox"
                checked={normalizeOutput ?? false}
                onChange={(e) => onNormalizeOutputChange(e.target.checked)}
                className="size-[18px] rounded-none border border-panel-border bg-control-bg accent-accent-orange"
              />
              Normalize
            </label>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3 text-xs text-app-muted">
        <span>{footerPrimaryText}</span>
        {footerSecondaryText ? <span>{footerSecondaryText}</span> : null}
      </div>
    </section>
  )
}

export default EditorPanel