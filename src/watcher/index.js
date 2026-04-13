import { writeFileSync, existsSync, unlinkSync, chmodSync } from 'node:fs'
import { saveState } from './save.js'
import { detectState, captureSessionId } from './detect.js'
import { readState } from '../state.js'
import { readProjects, readConfig } from '../config.js'
import { expandTilde, CC_DIR, watcherPidPath, saveTriggerPath } from '../paths.js'
import { listPanes, tmuxOut, SESSION } from '../tmux.js'

let previousPanes = []

function writePidFile() {
  const pidPath = watcherPidPath()
  writeFileSync(pidPath, String(process.pid))
  chmodSync(pidPath, 0o600)
}

function checkSaveTrigger() {
  const triggerPath = saveTriggerPath()
  if (existsSync(triggerPath)) {
    try { unlinkSync(triggerPath) } catch { /* race ok */ }
    return true
  }
  return false
}

function getCurrentFocus() {
  try {
    const windowName = tmuxOut(
      'display-message', '-t', SESSION, '-p', '#{window_name}'
    )
    const paneIndex = tmuxOut(
      'display-message', '-t', SESSION, '-p', '#{pane_index}'
    )
    return { focused_window: windowName, focused_pane: parseInt(paneIndex, 10) || 0 }
  } catch {
    return { focused_window: null, focused_pane: 0 }
  }
}

function buildProjectState(projects) {
  const panes = listPanes()
  const result = {}

  for (const project of projects) {
    const fullPath = expandTilde(project.path)
    let windowIndex = null
    try {
      const windows = tmuxOut('list-windows', '-t', SESSION, '-F', '#{window_index} #{window_name}')
      for (const line of windows.split('\n').filter(Boolean)) {
        const spaceIdx = line.indexOf(' ')
        const idx = parseInt(line.slice(0, spaceIdx), 10)
        const name = line.slice(spaceIdx + 1)
        if (name === project.alias) {
          windowIndex = idx
          break
        }
      }
    } catch { /* no session */ }

    if (windowIndex === null) continue

    const projectPanes = panes.filter((p) => p.windowIndex === windowIndex)
    // Shared set per project — prevents file-based fallback from assigning
    // the same session ID to multiple panes
    const claimedIds = new Set()
    const paneStates = projectPanes.map((p, i) => {
      const role = i === 0 ? 'orchestrator' : `worker-${i}`
      const result = captureSessionId(p.panePid, fullPath, claimedIds)

      let status = 'ready'
      if (result.sessionId) {
        status = 'active'
      } else if (result.claudeRunning) {
        status = 'untracked'
      }

      return { role, claude_session_id: result.sessionId, status }
    })

    result[project.path] = {
      window_index: windowIndex,
      panes: paneStates,
    }
  }

  return result
}

function tick() {
  const triggered = checkSaveTrigger()
  const { currentPanes, changed } = detectState(previousPanes)
  previousPanes = currentPanes

  if (!changed && !triggered) return false

  const projects = readProjects()
  const focus = getCurrentFocus()
  const projectState = buildProjectState(projects)

  const state = {
    version: 1,
    tmux: { session: SESSION, ...focus },
    projects: projectState,
  }

  const trigger = triggered ? 'manual' : 'event'
  saveState(CC_DIR, state, trigger)
  return true
}

function heartbeat() {
  const projects = readProjects()
  const focus = getCurrentFocus()
  const projectState = buildProjectState(projects)

  const state = {
    version: 1,
    tmux: { session: SESSION, ...focus },
    projects: projectState,
  }

  saveState(CC_DIR, state, 'heartbeat')
  previousPanes = listPanes()
}

export function startWatcher() {
  writePidFile()

  const config = readConfig()
  const interval = (config.auto_save_interval ?? 30) * 1000

  previousPanes = listPanes()
  heartbeat()

  setInterval(tick, 2000)
  setInterval(heartbeat, interval)

  process.on('SIGTERM', () => {
    try { unlinkSync(watcherPidPath()) } catch { /* ok */ }
    process.exit(0)
  })
}

// When run directly as a process
const entryFile = process.argv[1]
if (entryFile && (entryFile.endsWith('watcher/index.js') || entryFile.endsWith('watcher'))) {
  startWatcher()
}
