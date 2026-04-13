import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { listPanes, tmuxOut, SESSION } from '../tmux.js'

export function parseClaudeSessionFromArgs(args) {
  if (!args || !args.includes('claude')) return null
  const parts = args.split(/\s+/)
  const resumeIdx = parts.indexOf('--resume')
  if (resumeIdx === -1 || resumeIdx + 1 >= parts.length) return null
  return parts[resumeIdx + 1]
}

export function diffPanes(prev, curr) {
  const prevKeys = new Set(prev.map((p) => `${p.windowIndex}:${p.panePid}`))
  const currKeys = new Set(curr.map((p) => `${p.windowIndex}:${p.panePid}`))

  const added = curr.filter((p) => !prevKeys.has(`${p.windowIndex}:${p.panePid}`))
  const removed = prev.filter((p) => !currKeys.has(`${p.windowIndex}:${p.panePid}`))

  return { added, removed }
}

export function projectHashFromPath(absPath) {
  return absPath.replace(/\//g, '-')
}

export function getChildProcessArgs(pid) {
  try {
    const pids = execFileSync(
      'pgrep', ['-P', String(pid)],
      { encoding: 'utf-8', timeout: 3000 }
    ).trim()

    if (!pids) return null

    const childPids = pids.split('\n').filter(Boolean)
    for (const childPid of childPids) {
      const args = execFileSync(
        'ps', ['-o', 'args=', '-p', childPid],
        { encoding: 'utf-8', timeout: 3000 }
      ).trim()

      if (args.includes('claude')) return args

      // Check grandchildren
      try {
        const grandchildren = execFileSync(
          'pgrep', ['-P', childPid],
          { encoding: 'utf-8', timeout: 3000 }
        ).trim()

        for (const gcPid of grandchildren.split('\n').filter(Boolean)) {
          const gcArgs = execFileSync(
            'ps', ['-o', 'args=', '-p', gcPid],
            { encoding: 'utf-8', timeout: 3000 }
          ).trim()
          if (gcArgs.includes('claude')) return gcArgs
        }
      } catch {
        // No grandchildren
      }
    }

    return null
  } catch {
    return null
  }
}

export function isClaudeProcess(panePid) {
  try {
    const result = execFileSync(
      'pgrep', ['-P', String(panePid), '-x', 'claude'],
      { encoding: 'utf-8', timeout: 3000 }
    ).trim()
    return result.length > 0
  } catch {
    return false
  }
}

export function getSessionCreatedTime() {
  try {
    const raw = tmuxOut(
      'display-message', '-t', SESSION, '-p', '#{session_created}'
    )
    return parseInt(raw, 10) * 1000 // convert to ms
  } catch {
    return 0
  }
}

export function getSessionIdFromClaudeFiles(projectPath, minMtimeMs) {
  const hash = projectHashFromPath(projectPath)
  const claudeProjectDir = join(homedir(), '.claude', 'projects', hash)

  if (!existsSync(claudeProjectDir)) return null

  try {
    const files = readdirSync(claudeProjectDir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => {
        const filePath = join(claudeProjectDir, f)
        const { mtimeMs } = statSync(filePath)
        return { name: f, path: filePath, mtimeMs }
      })
      .filter((f) => f.mtimeMs >= minMtimeMs)

    if (files.length === 0) return null

    // Pick the most recently modified file that's newer than the gate
    let newest = null
    let newestTime = 0
    for (const file of files) {
      if (file.mtimeMs > newestTime) {
        newestTime = file.mtimeMs
        newest = file
      }
    }

    if (!newest) return null

    const firstLine = readFileSync(newest.path, 'utf-8').split('\n')[0]
    const data = JSON.parse(firstLine)
    return data.sessionId ?? null
  } catch {
    return null
  }
}

// Cache: PID → { sessionId, claudeRunning }. Once a sessionId is captured,
// don't re-resolve unless PID changes. Re-check claudeRunning if no sessionId yet.
const sessionCache = new Map()

/**
 * Capture session ID for a pane.
 * @param {number} panePid - PID of the pane's shell process
 * @param {string} projectPath - absolute path to the project
 * @param {Set} claimedIds - session IDs already assigned to other panes this cycle.
 *   File-based lookups that return an already-claimed ID are skipped (dedup).
 *   Process-args IDs are always trusted (they're per-process, not per-project).
 */
export function captureSessionId(panePid, projectPath, claimedIds = new Set()) {
  // If we already have a session ID cached for this PID, return it
  const cached = sessionCache.get(panePid)
  if (cached?.sessionId) {
    return cached
  }

  // Method 1: process args (--resume flag) — per-process, always correct
  const args = getChildProcessArgs(panePid)
  if (args) {
    const sessionId = parseClaudeSessionFromArgs(args)
    if (sessionId) {
      const result = { sessionId, claudeRunning: true }
      sessionCache.set(panePid, result)
      claimedIds.add(sessionId)
      return result
    }
  }

  // Method 2: Claude session files — per-project, must dedup across panes
  const claudeRunning = isClaudeProcess(panePid)
  if (claudeRunning) {
    const sessionCreated = getSessionCreatedTime()
    if (sessionCreated > 0) {
      const sessionId = getSessionIdFromClaudeFiles(projectPath, sessionCreated)
      // Only assign if not already claimed by another pane in this cycle
      if (sessionId && !claimedIds.has(sessionId)) {
        const result = { sessionId, claudeRunning: true }
        sessionCache.set(panePid, result)
        claimedIds.add(sessionId)
        return result
      }
    }
    return { sessionId: null, claudeRunning: true }
  }

  return { sessionId: null, claudeRunning: false }
}

export function clearSessionCache() {
  sessionCache.clear()
}

export function detectState(previousPanes) {
  const currentPanes = listPanes()
  const diff = diffPanes(previousPanes, currentPanes)
  const changed = diff.added.length > 0 || diff.removed.length > 0

  return { currentPanes, diff, changed }
}
