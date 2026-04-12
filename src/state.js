import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { CC_DIR } from './paths.js'

const EMPTY_STATE = {
  version: 1,
  saved_at: null,
  save_trigger: null,
  tmux: { session: 'cc', focused_window: null, focused_pane: 0 },
  projects: {},
}

export function readState(baseDir = CC_DIR) {
  const file = join(baseDir, 'state.json')
  try {
    const raw = readFileSync(file, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed.version !== 1) return { ...EMPTY_STATE }
    return parsed
  } catch {
    return { ...EMPTY_STATE, projects: {} }
  }
}

export function writeState(baseDir = CC_DIR, state) {
  const file = join(baseDir, 'state.json')
  const tmpFile = join(baseDir, 'state.json.tmp')
  const data = {
    ...state,
    saved_at: new Date().toISOString(),
  }
  writeFileSync(tmpFile, JSON.stringify(data, null, 2) + '\n', 'utf-8')
  chmodSync(tmpFile, 0o600)
  renameSync(tmpFile, file)
}

export function acquireLock(baseDir = CC_DIR) {
  const lockFile = join(baseDir, 'cc.lock')

  if (existsSync(lockFile)) {
    const storedPid = parseInt(readFileSync(lockFile, 'utf-8').trim(), 10)

    if (isPidAlive(storedPid)) {
      return { acquired: false, reason: 'running', pid: storedPid }
    }

    unlinkSync(lockFile)
    writeFileSync(lockFile, String(process.pid))
    chmodSync(lockFile, 0o600)
    return { acquired: true, stale: true, stalePid: storedPid }
  }

  writeFileSync(lockFile, String(process.pid))
  chmodSync(lockFile, 0o600)
  return { acquired: true, stale: false }
}

export function releaseLock(baseDir = CC_DIR) {
  const lockFile = join(baseDir, 'cc.lock')
  try {
    unlinkSync(lockFile)
  } catch {
    // Already removed
  }
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
