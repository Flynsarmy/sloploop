import type { ChangeEvent, CSSProperties, DragEvent, RefObject } from 'react'

type EditorPanelProps = {
  sourceName: string
  regionStart: number
  regionEnd: number
  audioLoaded: boolean
  showWaveform: boolean
  waveformRef: RefObject<HTMLDivElement | null>
  waveColor: string
  onDrop: (event: DragEvent<HTMLDivElement>) => void | Promise<void>
  onFileInput: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>
}

function EditorPanel({
  sourceName,
  regionStart,
  regionEnd,
  audioLoaded,
  showWaveform,
  waveformRef,
  waveColor,
  onDrop,
  onFileInput,
}: EditorPanelProps) {
  return (
    <section className="panel editor">
      <div className="editor-header">
        <div>
          <h2>{sourceName || 'No source loaded'}</h2>
          <p>Space = preview selection, E = export WAV</p>
        </div>
        <div className="selection-readout">
          <span>Start: {regionStart.toFixed(3)}s</span>
          <span>End: {regionEnd.toFixed(3)}s</span>
        </div>
      </div>

      <div className="wave-shell" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
        <div
          ref={waveformRef}
          className={`waveform${showWaveform ? '' : ' is-hidden'}`}
          style={{ '--waveform-base-color': waveColor } as CSSProperties}
        />
        {!audioLoaded ? (
          <div className="wave-empty-state">
            <p>Drag and drop WAV, OGG, MP3, AIFF</p>
            <p>Supported: WAV, OGG, MP3, AIFF, AIF</p>
            <label className="file-picker wave-empty-picker">
              <input type="file" accept="audio/*,.aiff,.aif,.wav,.ogg,.mp3" onChange={onFileInput} />
              Open File
            </label>
          </div>
        ) : null}
      </div>

      <div className="hint-strip">
        <span>Drag region handles to define selection.</span>
        <span>Mouse wheel over numeric fields for fine adjustments.</span>
        <span>10-minute import cap to keep browser memory stable.</span>
      </div>
    </section>
  )
}

export default EditorPanel