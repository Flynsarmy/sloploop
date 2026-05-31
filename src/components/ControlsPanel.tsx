import { useState } from 'react'
import type { ChangeEvent, WheelEvent } from 'react'
import type { LoopCurve, Mode } from '../types/app'

type ControlsPanelProps = {
  mode: Mode
  modeHelp: string
  loopCrossfadeSec: number
  crossfadeMaxSec: number
  loopCurve: LoopCurve
  snapToZeroCrossing: boolean
  embedLoopSidecar: boolean
  clipFadeInMs: number
  clipFadeOutMs: number
  cutCrossfadeSec: number
  canProcess: boolean
  hasCutUndo: boolean
  onModeChange: (mode: Mode) => void
  onLoopCrossfadeChange: (value: number) => void
  onLoopCurveChange: (curve: LoopCurve) => void
  onSnapToZeroCrossingChange: (checked: boolean) => void
  onEmbedLoopSidecarChange: (checked: boolean) => void
  onClipFadeInChange: (value: number) => void
  onClipFadeOutChange: (value: number) => void
  onCutCrossfadeChange: (value: number) => void
  onWheelNudge: (
    event: WheelEvent<HTMLInputElement>,
    value: number,
    setter: (value: number) => void,
    step: number,
    min: number,
    max: number,
  ) => void
  onApplyCut: () => void
  onUndoCut: () => void
  onExportWav: () => void
}

type NumberInputEvent = ChangeEvent<HTMLInputElement>
type CheckboxEvent = ChangeEvent<HTMLInputElement>
type SelectEvent = ChangeEvent<HTMLSelectElement>

const panelClassName =
  'grid max-h-none content-start gap-3 overflow-auto rounded-2xl border border-panel-border bg-panel-bg p-4 xl:max-h-[calc(100svh-120px)]'
const sectionClassName = 'grid gap-2 rounded-xl border border-panel-border p-3'
const headingClassName = 'm-0 mb-1 text-[15px] uppercase tracking-[0.08em] text-[#d8ccf1]'
const labelClassName = 'grid gap-1.5 text-[13px] text-app-muted'
const checkLabelClassName = 'grid grid-cols-[auto_1fr] items-center gap-2 text-[13px] text-app-muted'
const inputClassName =
  'rounded-none border border-panel-border bg-control-bg px-2.5 py-2 text-app-text outline-none transition focus:border-accent-orange'
const tabBaseClassName =
  'rounded-none border border-panel-border bg-control-bg px-2 py-2.5 font-medium tracking-[0.08em] text-white transition disabled:cursor-not-allowed disabled:opacity-50'
const inactiveTabClassName = `${tabBaseClassName} hover:border-app-muted`
const activeTabClassName = `${tabBaseClassName} !border-accent-orange !text-accent-orange`
const actionButtonClassName =
  'rounded-none border border-panel-border bg-control-bg px-2.5 py-2 text-white transition hover:border-app-muted disabled:cursor-not-allowed disabled:opacity-50'
const primaryButtonClassName =
  'rounded-none border border-accent-orange bg-control-bg px-2.5 py-2 text-accent-orange transition hover:bg-accent-orange/10 disabled:cursor-not-allowed disabled:opacity-50'
const modeButtonTitles: Record<Mode, string> = {
  loop: 'Loop mode: adjust crossfades and export loop metadata for seamless playback.',
  clip: 'Clip mode: apply fade-in and fade-out settings to the selected region.',
  cut: 'Cut mode: trim the selection and manage the seam crossfade for the edit.',
}

function Checkbox({
  checked,
  title,
  onChange,
}: {
  checked: boolean
  title: string
  onChange: (event: CheckboxEvent) => void
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      title={title}
      onChange={onChange}
      className="mt-0 size-[18px] rounded-none border border-panel-border bg-control-bg text-accent-orange accent-accent-orange"
    />
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

  const closeEditor = (nextValue: number) => {
    onCommit(nextValue)
    setIsEditing(false)
  }

  const commitDraft = () => {
    const parsedValue = Number(draftValue)
    if (Number.isFinite(parsedValue)) {
      closeEditor(parsedValue)
      return
    }
    setIsEditing(false)
    setDraftValue(value.toFixed(3))
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
      className="inline-flex items-center rounded-none border border-transparent px-1 py-0.5 text-accent-orange underline decoration-dotted decoration-current underline-offset-2 transition hover:border-panel-border hover:bg-control-bg/40"
    >
      {value.toFixed(3)} s
    </button>
  )
}

function LoopSettings({
  loopCrossfadeSec,
  crossfadeMaxSec,
  loopCurve,
  snapToZeroCrossing,
  embedLoopSidecar,
  onLoopCrossfadeChange,
  onLoopCurveChange,
  onSnapToZeroCrossingChange,
  onEmbedLoopSidecarChange,
}: {
  loopCrossfadeSec: number
  crossfadeMaxSec: number
  loopCurve: LoopCurve
  snapToZeroCrossing: boolean
  embedLoopSidecar: boolean
  onLoopCrossfadeChange: (value: number) => void
  onLoopCurveChange: (curve: LoopCurve) => void
  onSnapToZeroCrossingChange: (checked: boolean) => void
  onEmbedLoopSidecarChange: (checked: boolean) => void
}) {
  return (
    <div className={sectionClassName}>
      <h2 className={headingClassName}>Loop Settings</h2>
      <div className={labelClassName}>
        <span className="flex flex-wrap items-center gap-1">
          <span>Crossfade:</span>
          <EditableSecondsValue
            value={loopCrossfadeSec}
            min={0.001}
            max={crossfadeMaxSec}
            onCommit={onLoopCrossfadeChange}
          />
        </span>
      </div>
      <label className={labelClassName}>
        <input
          type="range"
          min={0.001}
          max={crossfadeMaxSec}
          step={0.001}
          value={loopCrossfadeSec}
          onChange={(event) => onLoopCrossfadeChange(Number(event.target.value))}
          className="w-full accent-accent-orange"
        />
      </label>
      <label className={labelClassName}>
        Curve
        <select
          value={loopCurve}
          title="Smoothstep eases the crossfade through the transition, while equal power keeps perceived loudness more even."
          onChange={(event: SelectEvent) => onLoopCurveChange(event.target.value as LoopCurve)}
          className={inputClassName}
        >
          <option value="smoothstep">Smoothstep</option>
          <option value="equal-power">Equal power</option>
        </select>
      </label>
      <label className={checkLabelClassName}>
        <Checkbox
          checked={snapToZeroCrossing}
          title="Move region boundaries to the nearest zero crossing (where the waveform crosses the center line at 0 amplitude) to reduce clicks and pops."
          onChange={(event: CheckboxEvent) => onSnapToZeroCrossingChange(event.target.checked)}
        />
        Snap region bounds to nearest zero crossing
      </label>
      <label className={checkLabelClassName}>
        <Checkbox
          checked={embedLoopSidecar}
          title="Write a matching JSON sidecar file so loop metadata can be reused in other tools."
          onChange={(event: CheckboxEvent) => onEmbedLoopSidecarChange(event.target.checked)}
        />
        Export loop sidecar JSON metadata
      </label>
    </div>
  )
}

function ClipSettings({
  clipFadeInMs,
  clipFadeOutMs,
  onClipFadeInChange,
  onClipFadeOutChange,
  onWheelNudge,
}: {
  clipFadeInMs: number
  clipFadeOutMs: number
  onClipFadeInChange: (value: number) => void
  onClipFadeOutChange: (value: number) => void
  onWheelNudge: ControlsPanelProps['onWheelNudge']
}) {
  return (
    <div className={sectionClassName}>
      <h2 className={headingClassName}>Clip Settings</h2>
      <label className={labelClassName}>
        Fade in ms
        <input
          type="number"
          min={0}
          max={3000}
          value={clipFadeInMs}
          onWheel={(event) => onWheelNudge(event, clipFadeInMs, onClipFadeInChange, 2, 0, 3000)}
          onChange={(event: NumberInputEvent) => onClipFadeInChange(Number(event.target.value))}
          className={inputClassName}
        />
      </label>
      <label className={labelClassName}>
        Fade out ms
        <input
          type="number"
          min={0}
          max={3000}
          value={clipFadeOutMs}
          onWheel={(event) => onWheelNudge(event, clipFadeOutMs, onClipFadeOutChange, 2, 0, 3000)}
          onChange={(event: NumberInputEvent) => onClipFadeOutChange(Number(event.target.value))}
          className={inputClassName}
        />
      </label>
    </div>
  )
}

function CutSettings({
  cutCrossfadeSec,
  crossfadeMaxSec,
  snapToZeroCrossing,
  canProcess,
  hasCutUndo,
  onCutCrossfadeChange,
  onSnapToZeroCrossingChange,
  onApplyCut,
  onUndoCut,
}: {
  cutCrossfadeSec: number
  crossfadeMaxSec: number
  snapToZeroCrossing: boolean
  canProcess: boolean
  hasCutUndo: boolean
  onCutCrossfadeChange: (value: number) => void
  onSnapToZeroCrossingChange: (checked: boolean) => void
  onApplyCut: () => void
  onUndoCut: () => void
}) {
  return (
    <div className={sectionClassName}>
      <h2 className={headingClassName}>Cut Settings</h2>
      <div className={labelClassName}>
        <span className="flex flex-wrap items-center gap-1">
          <span>Seam crossfade seconds (</span>
          <EditableSecondsValue
            value={cutCrossfadeSec}
            min={0}
            max={crossfadeMaxSec}
            onCommit={onCutCrossfadeChange}
          />
          <span>)</span>
        </span>
      </div>
      <label className={labelClassName}>
        <input
          type="range"
          min={0}
          max={crossfadeMaxSec}
          step={0.001}
          value={cutCrossfadeSec}
          onChange={(event) => onCutCrossfadeChange(Number(event.target.value))}
          className="w-full accent-accent-orange"
        />
      </label>
      <label className={checkLabelClassName}>
        <Checkbox
          checked={snapToZeroCrossing}
          title="Move region boundaries to the nearest zero crossing (where the waveform crosses the center line at 0 amplitude) to reduce clicks and pops."
          onChange={(event: CheckboxEvent) => onSnapToZeroCrossingChange(event.target.checked)}
        />
        Snap region bounds to nearest zero crossing
      </label>
      <div className="grid gap-2">
        <button
          type="button"
          onClick={onApplyCut}
          disabled={!canProcess}
          className={actionButtonClassName}
        >
          Apply Cut
        </button>
        <button
          type="button"
          onClick={onUndoCut}
          disabled={!hasCutUndo}
          className={actionButtonClassName}
        >
          Undo Cut
        </button>
      </div>
    </div>
  )
}

function OutputSettings({
  canProcess,
  onExportWav,
}: {
  canProcess: boolean
  onExportWav: () => void
}) {
  return (
    <div className={sectionClassName}>
      <h2 className={headingClassName}>Output</h2>
      <div className="grid gap-2">
        <button
          type="button"
          className={primaryButtonClassName}
          onClick={onExportWav}
          disabled={!canProcess}
        >
          Export WAV
        </button>
      </div>
    </div>
  )
}

function ControlsPanel({
  mode,
  modeHelp,
  loopCrossfadeSec,
  crossfadeMaxSec,
  loopCurve,
  snapToZeroCrossing,
  embedLoopSidecar,
  clipFadeInMs,
  clipFadeOutMs,
  cutCrossfadeSec,
  canProcess,
  hasCutUndo,
  onModeChange,
  onLoopCrossfadeChange,
  onLoopCurveChange,
  onSnapToZeroCrossingChange,
  onEmbedLoopSidecarChange,
  onClipFadeInChange,
  onClipFadeOutChange,
  onCutCrossfadeChange,
  onWheelNudge,
  onApplyCut,
  onUndoCut,
  onExportWav,
}: ControlsPanelProps) {
  return (
    <section className={panelClassName}>
      <div className="grid grid-cols-3 gap-2">
        {(['loop', 'clip', 'cut'] as Mode[]).map((item) => (
          <button
            key={item}
            type="button"
            className={item === mode ? activeTabClassName : inactiveTabClassName}
            title={modeButtonTitles[item]}
            onClick={() => onModeChange(item)}
          >
            {item.toUpperCase()}
          </button>
        ))}
      </div>

      <p className="m-0 text-sm text-app-muted">{modeHelp}</p>

      {mode === 'loop' ? (
        <LoopSettings
          loopCrossfadeSec={loopCrossfadeSec}
          crossfadeMaxSec={crossfadeMaxSec}
          loopCurve={loopCurve}
          snapToZeroCrossing={snapToZeroCrossing}
          embedLoopSidecar={embedLoopSidecar}
          onLoopCrossfadeChange={onLoopCrossfadeChange}
          onLoopCurveChange={onLoopCurveChange}
          onSnapToZeroCrossingChange={onSnapToZeroCrossingChange}
          onEmbedLoopSidecarChange={onEmbedLoopSidecarChange}
        />
      ) : null}

      {mode === 'clip' ? (
        <ClipSettings
          clipFadeInMs={clipFadeInMs}
          clipFadeOutMs={clipFadeOutMs}
          onClipFadeInChange={onClipFadeInChange}
          onClipFadeOutChange={onClipFadeOutChange}
          onWheelNudge={onWheelNudge}
        />
      ) : null}

      {mode === 'cut' ? (
        <CutSettings
          cutCrossfadeSec={cutCrossfadeSec}
          crossfadeMaxSec={crossfadeMaxSec}
          snapToZeroCrossing={snapToZeroCrossing}
          canProcess={canProcess}
          hasCutUndo={hasCutUndo}
          onCutCrossfadeChange={onCutCrossfadeChange}
          onSnapToZeroCrossingChange={onSnapToZeroCrossingChange}
          onApplyCut={onApplyCut}
          onUndoCut={onUndoCut}
        />
      ) : null}

      <OutputSettings canProcess={canProcess} onExportWav={onExportWav} />
    </section>
  )
}

export default ControlsPanel
