import { useState } from 'react'
import type { ChangeEvent, CSSProperties, DragEvent, RefObject } from 'react'
import { Pause, Play, Repeat, Square, Volume2 } from 'lucide-react'
import type { TransportState } from '../types/app'

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
  playbackVolume: number
  allowFileDrop?: boolean
  showImportCapMessage?: boolean
  footerPrimaryText?: string
  footerSecondaryText?: string
  selectionDurationSec?: number
  onRegionStartCommit?: (value: number) => void
  onRegionEndCommit?: (value: number) => void
  onDrop?: (event: DragEvent<HTMLDivElement>) => void | Promise<void>
  onFileInput?: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>
  normalizeOutput?: boolean
  onNormalizeOutputChange?: (checked: boolean) => void
  showApplyCutButton?: boolean
  onApplyCut?: () => void
  onPlaySelection: () => void
  onPauseSelection: () => void
  onStopPreview: () => void
  onToggleLoopPreview: () => void
  onPlaybackVolumeChange: (value: number) => void
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
  playbackVolume,
  allowFileDrop = true,
  showImportCapMessage = true,
  footerPrimaryText = 'Drag region handles to define selection.',
  footerSecondaryText,
  selectionDurationSec,
  onRegionStartCommit,
  onRegionEndCommit,
  normalizeOutput,
  onNormalizeOutputChange,
  showApplyCutButton = false,
  onApplyCut,
  onDrop,
  onFileInput,
  onPlaySelection,
  onPauseSelection,
  onStopPreview,
  onToggleLoopPreview,
  onPlaybackVolumeChange,
}: EditorPanelProps) {
  const boundsEditable =
    typeof selectionDurationSec === 'number' && onRegionStartCommit !== undefined && onRegionEndCommit !== undefined

  const controlButtonClass =
    'inline-flex h-10 w-10 items-center justify-center rounded-none border bg-control-bg transition disabled:cursor-not-allowed disabled:opacity-50'

  const getTransportClass = (isActive: boolean) =>
    `${controlButtonClass} ${isActive ? 'border-accent-orange text-accent-orange' : 'border-panel-border text-white hover:border-app-muted'}`

  const maxStart = boundsEditable ? Math.max(0, (selectionDurationSec ?? 0) - 0.001) : 0
  const minEnd = boundsEditable ? Math.min(selectionDurationSec ?? 0, regionStart + 0.001) : 0

  return (
    <section className="grid min-h-0 gap-3 rounded-2xl border border-panel-border bg-panel-bg p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="m-0 text-[22px] font-semibold">{sourceName || 'No source loaded'}</h2>
          {subtitleText ? <p className="mt-1 mb-0 text-[13px] text-app-muted">{subtitleText}</p> : null}
        </div>
        {audioLoaded ? (
          <div className="grid gap-1 text-[13px] text-app-muted md:text-right">
            <span className="flex items-center gap-1 md:justify-end">
              <span>Start:</span>
              {boundsEditable ? (
                <EditableSecondsValue
                  value={regionStart}
                  min={0}
                  max={maxStart}
                  onCommit={onRegionStartCommit}
                />
              ) : (
                <span>{regionStart.toFixed(3)}s</span>
              )}
            </span>
            <span className="flex items-center gap-1 md:justify-end">
              <span>End:</span>
              {boundsEditable ? (
                <EditableSecondsValue
                  value={regionEnd}
                  min={minEnd}
                  max={selectionDurationSec ?? 0}
                  onCommit={onRegionEndCommit}
                />
              ) : (
                <span>{regionEnd.toFixed(3)}s</span>
              )}
            </span>
          </div>
        ) : null}
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
          <label
            className="ml-1 inline-flex items-center gap-0.5 text-[13px] text-app-muted"
            title="Preview volume affects playback loudness only. It does not change waveform display or exported WAV level."
          >
            <span className="pr-3"><Volume2 size={17} /></span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={playbackVolume}
              onChange={(event) => onPlaybackVolumeChange(Number(event.target.value))}
              className="w-28 accent-accent-orange"
            />
            <span className="pl-1 min-w-10 text-left">{Math.round(playbackVolume * 100)}%</span>
          </label>
          {onNormalizeOutputChange !== undefined ? (
            <label className="ml-1 inline-flex cursor-pointer select-none items-center gap-2 text-[13px] text-app-muted">
              <input
                type="checkbox"
                checked={normalizeOutput ?? false}
                title="Normalize the rendered output so quiet selections are brought up to full scale before export."
                onChange={(e) => onNormalizeOutputChange(e.target.checked)}
                className="size-[18px] rounded-none border border-panel-border bg-control-bg accent-accent-orange"
              />
              Normalize
            </label>
          ) : null}
          {showApplyCutButton && onApplyCut ? (
            <button
              type="button"
              title="Apply the current cut to commit this selection, then make a new selection for the next cut."
              aria-label="Apply cut"
              className="ml-auto rounded-none border border-accent-orange bg-control-bg px-3 py-2 text-[13px] font-medium text-accent-orange transition hover:bg-accent-orange/10 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onApplyCut}
              disabled={!canProcess}
            >
              Apply Cut
            </button>
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

function EditableSecondsValue({
  value,
  min,
  max,
  onCommit,
}: {
  value: number
  min: number
  max: number
  onCommit: (value: number) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [draftValue, setDraftValue] = useState(value.toFixed(3))

  const commitDraft = () => {
    const parsedValue = Number(draftValue)
    if (Number.isFinite(parsedValue)) {
      onCommit(parsedValue)
      setIsEditing(false)
      return
    }
    setDraftValue(value.toFixed(3))
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={0.001}
        value={draftValue}
        autoFocus
        onChange={(event) => setDraftValue(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commitDraft()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            setDraftValue(value.toFixed(3))
            setIsEditing(false)
          }
        }}
        className="inline-flex w-24 rounded-none border border-panel-border bg-control-bg px-2 py-1 text-accent-orange outline-none transition focus:border-accent-orange"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraftValue(value.toFixed(3))
        setIsEditing(true)
      }}
      className="inline-flex cursor-pointer items-center rounded-none border border-transparent px-1 py-0.5 text-accent-orange underline decoration-dotted decoration-current underline-offset-2 transition hover:border-panel-border hover:bg-control-bg/40"
    >
      {value.toFixed(3)} s
    </button>
  )
}

export default EditorPanel