import { execFile } from 'node:child_process'

export function getListeningPorts() {
  return new Promise((resolve) => {
    execFile(
      'lsof',
      ['-i', '-P', '-n', '-sTCP:LISTEN', '+c0'],
      { timeout: 3000 },
      (error, stdout) => {
        if (error) {
          resolve([])
          return
        }
        resolve(parseLsofOutput(stdout))
      },
    )
  })
}

export function parseLsofOutput(output) {
  const lines = output.split('\n').filter(Boolean)
  if (lines.length < 2) return []

  const entries = []
  const seen = new Set()

  for (let i = 1; i < lines.length; i++) {
    const parsed = parseLsofLine(lines[i])
    if (!parsed) continue

    const key = `${parsed.pid}:${parsed.port}`
    if (seen.has(key)) continue
    seen.add(key)

    entries.push(parsed)
  }

  return entries
}

function parseLsofLine(line) {
  if (!line.includes('(LISTEN)')) return null

  const parts = line.trim().split(/\s+/)
  if (parts.length < 9) return null

  const name = parts[0]
  const pid = parseInt(parts[1], 10)
  if (isNaN(pid)) return null

  const namePart = parts[parts.length - 2]
  const colonIdx = namePart.lastIndexOf(':')
  if (colonIdx === -1) return null

  const host = namePart.slice(0, colonIdx)
  const port = parseInt(namePart.slice(colonIdx + 1), 10)
  if (isNaN(port)) return null

  return { name, pid, port, host }
}
