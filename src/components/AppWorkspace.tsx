import type { ChangeEvent, ComponentProps, DragEvent, RefObject } from 'react'
import ControlsPanel from './ControlsPanel'
import EditorPanel from './EditorPanel'
import type { LoopCurve, Mode, TransportState } from '../types/app'

type AppWorkspaceProps = {
  audioBuffer: AudioBuffer | null
  sourceName: string
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
  regionStart: number
  regionEnd: number
  showWaveform: boolean
  hasActiveSelection: boolean
  processedBuffer: AudioBuffer | null
  processedResultTitle: string
  normalizeOutput: boolean
  waveformRef: RefObject<HTMLDivElement | null>
  processedWaveformRef: RefObject<HTMLDivElement | null>
  transportState: TransportState
  processedTransportState: TransportState
  loopPreviewEnabled: boolean
  processedLoopPreviewEnabled: boolean
  waveColor: string
  onModeChange: (mode: Mode) => void
  onLoopCrossfadeChange: (value: number) => void
  onLoopCurveChange: (curve: LoopCurve) => void
  onSnapToZeroCrossingChange: (checked: boolean) => void
  onEmbedLoopSidecarChange: (checked: boolean) => void
  onClipFadeInChange: (value: number) => void
  onClipFadeOutChange: (value: number) => void
  onCutCrossfadeChange: (value: number) => void
  onWheelNudge: ControlsPanelProps['onWheelNudge']
  onApplyCut: () => void
  onUndoCut: () => void
  onExportWav: () => void
  onDrop: (event: DragEvent<HTMLDivElement>) => void | Promise<void>
  onFileInput: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>
  onPlaySelection: () => void
  onPauseSelection: () => void
  onStopPreview: () => void
  onToggleLoopPreview: () => void
  onRegionStartCommit: (value: number) => void
  onRegionEndCommit: (value: number) => void
  onNormalizeOutputChange: (checked: boolean) => void
  onPlayProcessedPreview: () => void
  onPauseProcessedPreview: () => void
  onStopProcessedPreview: () => void
  onToggleProcessedLoopPreview: () => void
}

type ControlsPanelProps = ComponentProps<typeof ControlsPanel>

function AppWorkspace({
  audioBuffer,
  sourceName,
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
  regionStart,
  regionEnd,
  showWaveform,
  hasActiveSelection,
  processedBuffer,
  processedResultTitle,
  normalizeOutput,
  waveformRef,
  processedWaveformRef,
  transportState,
  processedTransportState,
  loopPreviewEnabled,
  processedLoopPreviewEnabled,
  waveColor,
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
  onDrop,
  onFileInput,
  onPlaySelection,
  onPauseSelection,
  onStopPreview,
  onToggleLoopPreview,
  onRegionStartCommit,
  onRegionEndCommit,
  onNormalizeOutputChange,
  onPlayProcessedPreview,
  onPauseProcessedPreview,
  onStopProcessedPreview,
  onToggleProcessedLoopPreview,
}: AppWorkspaceProps) {
  const showSelectRegionPrompt = showWaveform && !hasActiveSelection

  return (
    <main className={audioBuffer ? 'grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]' : 'grid gap-4'}>
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
          onModeChange={onModeChange}
          onLoopCrossfadeChange={onLoopCrossfadeChange}
          onLoopCurveChange={onLoopCurveChange}
          onSnapToZeroCrossingChange={onSnapToZeroCrossingChange}
          onEmbedLoopSidecarChange={onEmbedLoopSidecarChange}
          onClipFadeInChange={onClipFadeInChange}
          onClipFadeOutChange={onClipFadeOutChange}
          onCutCrossfadeChange={onCutCrossfadeChange}
          onWheelNudge={onWheelNudge}
          onApplyCut={onApplyCut}
          onUndoCut={onUndoCut}
          onExportWav={onExportWav}
        />
      ) : null}

      <div className="grid gap-4">
        <EditorPanel
          sourceName={sourceName}
          regionStart={regionStart}
          regionEnd={regionEnd}
          selectionDurationSec={audioBuffer?.duration}
          audioLoaded={Boolean(audioBuffer)}
          canProcess={canProcess}
          showWaveform={showWaveform}
          waveformRef={waveformRef}
          waveColor={waveColor}
          transportState={transportState}
          loopPreviewEnabled={loopPreviewEnabled}
          normalizeOutput={normalizeOutput}
          onNormalizeOutputChange={onNormalizeOutputChange}
          onDrop={onDrop}
          onFileInput={onFileInput}
          onPlaySelection={onPlaySelection}
          onPauseSelection={onPauseSelection}
          onStopPreview={onStopPreview}
          onToggleLoopPreview={onToggleLoopPreview}
          onRegionStartCommit={onRegionStartCommit}
          onRegionEndCommit={onRegionEndCommit}
          footerPrimaryText="Drag region handles to define selection."
        />

        {showSelectRegionPrompt ? (
          <EditorPanel
            sourceName={processedResultTitle}
            subtitleText="Select a region to preview the result."
            regionStart={0}
            regionEnd={0}
            audioLoaded
            canProcess={false}
            showWaveform
            waveformRef={processedWaveformRef}
            waveColor={waveColor}
            transportState="stop"
            loopPreviewEnabled={processedLoopPreviewEnabled}
            allowFileDrop={false}
            showImportCapMessage={false}
            onPlaySelection={() => undefined}
            onPauseSelection={() => undefined}
            onStopPreview={() => undefined}
            onToggleLoopPreview={() => undefined}
            footerPrimaryText=""
          />
        ) : null}

        {hasActiveSelection && processedBuffer ? (
          <EditorPanel
            sourceName={processedResultTitle}
            regionStart={0}
            regionEnd={processedBuffer.duration}
            audioLoaded
            canProcess
            showWaveform
            waveformRef={processedWaveformRef}
            waveColor={waveColor}
            transportState={processedTransportState}
            loopPreviewEnabled={processedLoopPreviewEnabled}
            allowFileDrop={false}
            showImportCapMessage={false}
            onPlaySelection={onPlayProcessedPreview}
            onPauseSelection={onPauseProcessedPreview}
            onStopPreview={onStopProcessedPreview}
            onToggleLoopPreview={onToggleProcessedLoopPreview}
            subtitleText="Processed waveform from current selection."
            footerPrimaryText=""
          />
        ) : null}
      </div>
    </main>
  )
}

export default AppWorkspace
