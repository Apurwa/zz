import { homedir } from 'node:os'
import { join } from 'node:path'

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
