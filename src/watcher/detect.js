import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { listPanes } from '../tmux.js'

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

export function getSessionIdFromClaudeFiles(projectPath) {
  const hash = projectHashFromPath(projectPath)
  const claudeProjectDir = join(homedir(), '.claude', 'projects', hash)

  if (!existsSync(claudeProjectDir)) return null

  try {
    const files = readdirSync(claudeProjectDir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => ({
        name: f,
        path: join(claudeProjectDir, f),
      }))

    if (files.length === 0) return null

    let newest = null
    let newestTime = 0
    for (const file of files) {
      const { mtimeMs } = statSync(file.path)
      if (mtimeMs > newestTime) {
        newestTime = mtimeMs
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

export function captureSessionId(panePid, projectPath) {
  const args = getChildProcessArgs(panePid)
  if (args) {
    const sessionId = parseClaudeSessionFromArgs(args)
    if (sessionId) return sessionId
  }

  return getSessionIdFromClaudeFiles(projectPath)
}

export function detectState(previousPanes) {
  const currentPanes = listPanes()
  const diff = diffPanes(previousPanes, currentPanes)
  const changed = diff.added.length > 0 || diff.removed.length > 0

  return { currentPanes, diff, changed }
}
