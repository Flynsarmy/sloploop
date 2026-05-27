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
  normalizeOutput: boolean
  canProcess: boolean
  hasCutUndo: boolean
  isPlayingPreview: boolean
  onModeChange: (mode: Mode) => void
  onLoopCrossfadeChange: (value: number) => void
  onLoopCurveChange: (curve: LoopCurve) => void
  onSnapToZeroCrossingChange: (checked: boolean) => void
  onEmbedLoopSidecarChange: (checked: boolean) => void
  onClipFadeInChange: (value: number) => void
  onClipFadeOutChange: (value: number) => void
  onCutCrossfadeChange: (value: number) => void
  onNormalizeOutputChange: (checked: boolean) => void
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
  onPreviewSelection: () => void
  onPreviewProcessed: () => void
  onStopPreview: () => void
  onExportWav: () => void
}

type NumberInputEvent = ChangeEvent<HTMLInputElement>
type CheckboxEvent = ChangeEvent<HTMLInputElement>
type SelectEvent = ChangeEvent<HTMLSelectElement>

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
    <div className="field-block">
      <h2>Loop Settings</h2>
      <label>
        Crossfade seconds ({loopCrossfadeSec.toFixed(3)}s)
        <input
          type="range"
          min={0.001}
          max={crossfadeMaxSec}
          step={0.001}
          value={loopCrossfadeSec}
          onChange={(event) => onLoopCrossfadeChange(Number(event.target.value))}
        />
      </label>
      <label>
        Curve
        <select
          value={loopCurve}
          onChange={(event: SelectEvent) => onLoopCurveChange(event.target.value as LoopCurve)}
        >
          <option value="smoothstep">Smoothstep</option>
          <option value="equal-power">Equal power</option>
        </select>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={snapToZeroCrossing}
          onChange={(event: CheckboxEvent) => onSnapToZeroCrossingChange(event.target.checked)}
        />
        Snap region bounds to nearest zero crossing
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={embedLoopSidecar}
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
    <div className="field-block">
      <h2>Clip Settings</h2>
      <label>
        Fade in ms
        <input
          type="number"
          min={0}
          max={3000}
          value={clipFadeInMs}
          onWheel={(event) => onWheelNudge(event, clipFadeInMs, onClipFadeInChange, 2, 0, 3000)}
          onChange={(event: NumberInputEvent) => onClipFadeInChange(Number(event.target.value))}
        />
      </label>
      <label>
        Fade out ms
        <input
          type="number"
          min={0}
          max={3000}
          value={clipFadeOutMs}
          onWheel={(event) => onWheelNudge(event, clipFadeOutMs, onClipFadeOutChange, 2, 0, 3000)}
          onChange={(event: NumberInputEvent) => onClipFadeOutChange(Number(event.target.value))}
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
    <div className="field-block">
      <h2>Cut Settings</h2>
      <label>
        Seam crossfade seconds ({cutCrossfadeSec.toFixed(3)}s)
        <input
          type="range"
          min={0}
          max={crossfadeMaxSec}
          step={0.001}
          value={cutCrossfadeSec}
          onChange={(event) => onCutCrossfadeChange(Number(event.target.value))}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={snapToZeroCrossing}
          onChange={(event: CheckboxEvent) => onSnapToZeroCrossingChange(event.target.checked)}
        />
        Snap region bounds to nearest zero crossing
      </label>
      <div className="cut-actions">
        <button type="button" onClick={onApplyCut} disabled={!canProcess}>
          Apply Cut
        </button>
        <button type="button" onClick={onUndoCut} disabled={!hasCutUndo}>
          Undo Cut
        </button>
      </div>
    </div>
  )
}

function OutputSettings({
  normalizeOutput,
  canProcess,
  isPlayingPreview,
  onNormalizeOutputChange,
  onPreviewSelection,
  onPreviewProcessed,
  onStopPreview,
  onExportWav,
}: {
  normalizeOutput: boolean
  canProcess: boolean
  isPlayingPreview: boolean
  onNormalizeOutputChange: (checked: boolean) => void
  onPreviewSelection: () => void
  onPreviewProcessed: () => void
  onStopPreview: () => void
  onExportWav: () => void
}) {
  return (
    <div className="field-block">
      <h2>Output</h2>
      <label className="check">
        <input
          type="checkbox"
          checked={normalizeOutput}
          onChange={(event: CheckboxEvent) => onNormalizeOutputChange(event.target.checked)}
        />
        Normalize exported WAV
      </label>
      <div className="action-row">
        <button type="button" onClick={onPreviewSelection} disabled={!canProcess}>
          Preview Selection
        </button>
        <button type="button" onClick={onPreviewProcessed} disabled={!canProcess}>
          Preview Processed
        </button>
        <button type="button" onClick={onStopPreview} disabled={!isPlayingPreview}>
          Stop
        </button>
        <button type="button" className="primary" onClick={onExportWav} disabled={!canProcess}>
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
  normalizeOutput,
  canProcess,
  hasCutUndo,
  isPlayingPreview,
  onModeChange,
  onLoopCrossfadeChange,
  onLoopCurveChange,
  onSnapToZeroCrossingChange,
  onEmbedLoopSidecarChange,
  onClipFadeInChange,
  onClipFadeOutChange,
  onCutCrossfadeChange,
  onNormalizeOutputChange,
  onWheelNudge,
  onApplyCut,
  onUndoCut,
  onPreviewSelection,
  onPreviewProcessed,
  onStopPreview,
  onExportWav,
}: ControlsPanelProps) {
  return (
    <section className="panel controls">
      <div className="mode-tabs">
        {(['loop', 'clip', 'cut'] as Mode[]).map((item) => (
          <button
            key={item}
            type="button"
            className={item === mode ? 'active' : ''}
            onClick={() => onModeChange(item)}
          >
            {item.toUpperCase()}
          </button>
        ))}
      </div>

      <p className="mode-help">{modeHelp}</p>

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

      <OutputSettings
        normalizeOutput={normalizeOutput}
        canProcess={canProcess}
        isPlayingPreview={isPlayingPreview}
        onNormalizeOutputChange={onNormalizeOutputChange}
        onPreviewSelection={onPreviewSelection}
        onPreviewProcessed={onPreviewProcessed}
        onStopPreview={onStopPreview}
        onExportWav={onExportWav}
      />
    </section>
  )
}

export default ControlsPanel