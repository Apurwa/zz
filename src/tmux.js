import { execFileSync, spawnSync } from 'node:child_process'

export const SESSION = 'cc'

export function tmux(...args) {
  return spawnSync('tmux', args, { stdio: 'inherit' })
}

export function tmuxOut(...args) {
  try {
    return execFileSync('tmux', args, { encoding: 'utf-8' }).trim()
  } catch {
    return ''
  }
}

export function sessionExists() {
  const result = spawnSync('tmux', ['has-session', '-t', SESSION], { stdio: 'ignore' })
  return result.status === 0
}

export function assertTmux() {
  const result = spawnSync('tmux', ['-V'], { stdio: 'pipe' })
  if (result.status !== 0) {
    console.error('tmux is not installed. Install it with: brew install tmux')
    process.exit(1)
  }
}

export function listPanes() {
  const raw = tmuxOut(
    'list-panes', '-s', '-t', SESSION,
    '-F', '#{window_index} #{pane_index} #{pane_pid}'
  )
  return parsePaneList(raw)
}

export function parsePaneList(raw) {
  if (!raw) return []
  return raw.split('\n').filter(Boolean).map((line) => {
    const [windowIndex, paneIndex, panePid] = line.split(' ').map(Number)
    return { windowIndex, paneIndex, panePid }
  })
}

export function getWindowList() {
  const raw = tmuxOut(
    'list-windows', '-t', SESSION,
    '-F', '#{window_index} #{window_name}'
  )
  if (!raw) return []
  return raw.split('\n').filter(Boolean).map((line) => {
    const spaceIdx = line.indexOf(' ')
    return {
      index: parseInt(line.slice(0, spaceIdx), 10),
      name: line.slice(spaceIdx + 1),
    }
  })
}

export function selectWindow(nameOrIndex) {
  tmux('select-window', '-t', `${SESSION}:${nameOrIndex}`)
}

export function sendKeys(target, keys) {
  tmux('send-keys', '-t', target, keys, 'Enter')
}

export function killSession() {
  tmux('kill-session', '-t', SESSION)
}
