import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { CC_DIR } from './paths.js'

const DEFAULT_CONFIG = {
  default_workers: 2,
  auto_save_interval: 30,
  portscout_window: false,
  scan_dir: null,
}

function writeSecure(filePath, data) {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
  chmodSync(filePath, 0o600)
}

export function scaffold(baseDir = CC_DIR) {
  if (!existsSync(baseDir)) {
    mkdirSync(baseDir, { recursive: true, mode: 0o700 })
  } else {
    chmodSync(baseDir, 0o700)
  }

  const configFile = join(baseDir, 'config.json')
  if (!existsSync(configFile)) {
    writeSecure(configFile, DEFAULT_CONFIG)
  }

  const projectsFile = join(baseDir, 'projects.json')
  if (!existsSync(projectsFile)) {
    writeSecure(projectsFile, [])
  }
}

export function readConfig(baseDir = CC_DIR) {
  const configFile = join(baseDir, 'config.json')
  try {
    return JSON.parse(readFileSync(configFile, 'utf-8'))
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function updateConfig(baseDir = CC_DIR, updates) {
  const current = readConfig(baseDir)
  const updated = { ...current, ...updates }
  writeSecure(join(baseDir, 'config.json'), updated)
  return updated
}

export function readProjects(baseDir = CC_DIR) {
  const projectsFile = join(baseDir, 'projects.json')
  try {
    return JSON.parse(readFileSync(projectsFile, 'utf-8'))
  } catch {
    return []
  }
}

export function addProject(baseDir = CC_DIR, project) {
  const projects = readProjects(baseDir)
  const exists = projects.some((p) => p.path === project.path)
  if (exists) return false

  const updated = [...projects, project]
  writeSecure(join(baseDir, 'projects.json'), updated)
  return true
}

export function removeProject(baseDir = CC_DIR, alias) {
  const projects = readProjects(baseDir)
  const updated = projects.filter((p) => p.alias !== alias)
  if (updated.length === projects.length) return false

  writeSecure(join(baseDir, 'projects.json'), updated)
  return true
}

export function findProject(baseDir = CC_DIR, aliasOrPath) {
  const projects = readProjects(baseDir)
  return projects.find((p) => p.alias === aliasOrPath || p.path === aliasOrPath) ?? null
}
