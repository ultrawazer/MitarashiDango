export interface ParsedCue {
  start: number
  end: number
  text: string
}

export function parseVttTimestamp(ts: string): number {
  const clean = ts.trim().replace(',', '.')
  const parts = clean.split(':')
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2])
  } else if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1])
  }
  return 0
}

export function parseVttCue(block: string): ParsedCue | null {
  const lines = block.trim().split(/\r?\n/)
  if (lines.length === 0) return null

  let timingLineIndex = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('-->')) {
      timingLineIndex = i
      break
    }
  }
  if (timingLineIndex === -1) return null

  const timingLine = lines[timingLineIndex]
  const arrowIdx = timingLine.indexOf('-->')
  const startStr = timingLine.slice(0, arrowIdx).trim()
  const endStr = timingLine.slice(arrowIdx + 3).trim().split(/\s+/)[0]

  const start = parseVttTimestamp(startStr)
  const end = parseVttTimestamp(endStr)
  if (isNaN(start) || isNaN(end) || end <= start) return null

  const text = lines.slice(timingLineIndex + 1).join('\n').trim()
  if (!text) return null

  return { start, end, text }
}
