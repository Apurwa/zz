import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { renderDashboard } from './render.js'
import { createInputHandler } from './input.js'
import { readState } from '../state.js'
import { readProjects } from '../config.js'
import { expandTilde, watcherPidPath } from '../paths.js'
import { SESSION, tmux, getPaneBaseIndex } from '../tmux.js'
import { getListeningPorts } from '../ports/lsof.js'
import { categorize } from '../ports/categorize.js'
import { getProcessDetails, getStartTimes, formatUptime } from '../ports/process.js'

let renderTimer = null
let renderPaused = false

let gitCache = {}
let gitCacheTime = 0
const GIT_CACHE_TTL = 5000

function gitCmd(args, cwd) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, encoding: 'utf-8', timeout: 3000 }, (err, stdout) => {
      resolve(err ? null : stdout.trim())
    })
  })
}

async function getGitInfoForProject(projectPath) {
  const [branch, porcelain, revList, lastCommit] = await Promise.all([
    gitCmd(['rev-parse', '--abbrev-ref', 'HEAD'], projectPath),
    gitCmd(['status', '--porcelain'], projectPath),
    gitCmd(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], projectPath),
    gitCmd(['log', '-1', '--format=%cr'], projectPath),
  ])

  const dirty = porcelain !== null && porcelain.length > 0
  let ahead = null
  let behind = null
  if (revList) {
    const parts = revList.split('\t')
    ahead = parseInt(parts[0], 10) || 0
    behind = parseInt(parts[1], 10) || 0
  }

  return {
    branch: branch ?? '?',
    dirty,
    ahead,
    behind,
    lastCommit: lastCommit ?? '?',
  }
}

async function getGitInfo(projects) {
  const now = Date.now()
  if (now - gitCacheTime < GIT_CACHE_TTL && Object.keys(gitCache).length > 0) {
    return gitCache
  }

  const entries = await Promise.all(
    projects.map(async (project) => {
      const fullPath = expandTilde(project.path)
      const info = await getGitInfoForProject(fullPath)
      return [project.path, info]
    })
  )

  gitCache = Object.fromEntries(entries)
  gitCacheTime = now
  return gitCache
}

export function invalidateGitCache() {
  gitCacheTime = 0
}

let portCache = null
let portCacheTime = 0
const PORT_CACHE_TTL = 5000

async function getPortInfo() {
  const now = Date.now()
  if (portCache && now - portCacheTime < PORT_CACHE_TTL) {
    return portCache
  }

  try {
    const entries = await getListeningPorts()
    const categorized = categorize(entries)
    const allPorts = [...categorized.dev, ...categorized.infra]
    const pids = [...new Set(allPorts.map((p) => p.pid))]

    const [details, startTimes] = await Promise.all([
      getProcessDetails(pids),
      getStartTimes(pids),
    ])

    const enriched = allPorts.map((entry) => {
      const detail = details.get(entry.pid) ?? { command: '', cwd: '' }
      const startTime = startTimes.get(entry.pid)
      return {
        ...entry,
        command: detail.command,
        cwd: detail.cwd,
        uptime: startTime ? formatUptime(startTime) : '',
      }
    })

    portCache = enriched
    portCacheTime = now
    return enriched
  } catch {
    return null
  }
}

export function invalidatePortCache() {
  portCacheTime = 0
}

function isWatcherAlive() {
  const pidPath = watcherPidPath()
  if (!existsSync(pidPath)) return false

  try {
    const pid = parseInt(readFileSync(pidPath, 'utf-8').trim(), 10)
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function respawnWatcher() {
  try {
    const base = getPaneBaseIndex()
    const watcherPath = new URL('../watcher/index.js', import.meta.url).pathname
    tmux(
      'split-window', '-v', '-l', '1', '-t', `${SESSION}:dashboard.${base}`,
      `node ${watcherPath} >/dev/null 2>&1`
    )
  } catch {
    // Will retry next render cycle
  }
}

async function render() {
  if (renderPaused) return

  const projects = readProjects()
  const state = readState()
  const [gitInfo, portInfo] = await Promise.all([
    getGitInfo(projects),
    getPortInfo(),
  ])
  const watcherAlive = isWatcherAlive()

  if (!watcherAlive) {
    respawnWatcher()
  }

  const output = renderDashboard(projects, state, gitInfo, { watcherAlive }, portInfo)

  process.stdout.write('\x1B[2J\x1B[H')
  process.stdout.write(output)
}

function shutdown() {
  if (renderTimer) clearInterval(renderTimer)

  if (process.stdin.isRaw) process.stdin.setRawMode(false)

  import('../commands/down.js').then((mod) => mod.default([]))
}

export function startDashboard() {
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.setEncoding('utf-8')

  const handleKey = createInputHandler({
    onRender: render,
    onShutdown: shutdown,
    onInvalidateCache: () => {
      invalidateGitCache()
      invalidatePortCache()
    },
    onPause: () => {
      renderPaused = true
      process.stdin.removeListener('data', keyListener)
    },
    onResume: () => {
      renderPaused = false
      process.stdin.on('data', keyListener)
    },
  })

  function keyListener(key) {
    if (key === '\u0003') {
      shutdown()
      return
    }
    handleKey(key)
  }

  process.stdin.on('data', keyListener)

  render()

  renderTimer = setInterval(render, 2000)

  process.on('SIGTERM', () => {
    if (renderTimer) clearInterval(renderTimer)
    if (process.stdin.isRaw) process.stdin.setRawMode(false)
    process.exit(0)
  })
}

const entryFile = process.argv[1]
if (entryFile && (entryFile.endsWith('dashboard/index.js') || entryFile.endsWith('dashboard'))) {
  startDashboard()
}
