export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

export function findNearestZeroCrossing(
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

export function createEmptyLike(buffer: AudioBuffer, length: number, ctx: AudioContext): AudioBuffer {
  return ctx.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate)
}

export function copyBuffer(buffer: AudioBuffer, ctx: AudioContext): AudioBuffer {
  const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate)
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    out.copyToChannel(buffer.getChannelData(ch), ch)
  }
  return out
}

export function normalizeBuffer(buffer: AudioBuffer): void {
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

export function audioBufferToWavBytes(buffer: AudioBuffer): ArrayBuffer {
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

export function bufferToWavBlob(buffer: AudioBuffer): Blob {
  return new Blob([audioBufferToWavBytes(buffer)], { type: 'audio/wav' })
}

export function triggerDownload(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(href)
}
