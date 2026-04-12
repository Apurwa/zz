import { homedir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const HOME = homedir()

export const CC_DIR = join(HOME, '.cc')

export function expandTilde(p) {
  if (p.startsWith('~/')) {
    return join(HOME, p.slice(2))
  }
  if (p === '~') {
    return HOME
  }
  return p
}

export function contractTilde(p) {
  if (p.startsWith(HOME)) {
    return '~' + p.slice(HOME.length)
  }
  return p
}

export function configPath() {
  return join(CC_DIR, 'config.json')
}

export function projectsPath() {
  return join(CC_DIR, 'projects.json')
}

export function statePath() {
  return join(CC_DIR, 'state.json')
}

export function lockPath() {
  return join(CC_DIR, 'cc.lock')
}

export function watcherPidPath() {
  return join(CC_DIR, 'watcher.pid')
}

export function saveTriggerPath() {
  return join(CC_DIR, 'save-trigger')
}

export function isGitRepo(dir) {
  try {
    execFileSync('git', ['-C', dir, 'rev-parse', '--git-dir'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export function timeSince(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainMinutes = minutes % 60
  return `${hours}h ${remainMinutes}m`
}
