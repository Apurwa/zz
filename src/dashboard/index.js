import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { renderDashboard } from './render.js'
import { createInputHandler } from './input.js'
import { readState } from '../state.js'
import { readProjects } from '../config.js'
import { expandTilde, watcherPidPath } from '../paths.js'
import { SESSION, tmux } from '../tmux.js'

let renderTimer = null

function getGitInfo(projects) {
  const info = {}
  for (const project of projects) {
    const fullPath = expandTilde(project.path)
    try {
      const branch = execFileSync(
        'git', ['-C', fullPath, 'rev-parse', '--abbrev-ref', 'HEAD'],
        { encoding: 'utf-8', timeout: 3000 }
      ).trim()

      const lastCommitRaw = execFileSync(
        'git', ['-C', fullPath, 'log', '-1', '--format=%cr'],
        { encoding: 'utf-8', timeout: 3000 }
      ).trim()

      info[project.path] = { branch, lastCommit: lastCommitRaw }
    } catch {
      info[project.path] = { branch: '?', lastCommit: '?' }
    }
  }
  return info
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
    const watcherPath = new URL('../watcher/index.js', import.meta.url).pathname
    tmux(
      'split-window', '-v', '-p', '1', '-t', `${SESSION}:dashboard`,
      `node ${watcherPath}`
    )
  } catch {
    // Will retry next render cycle
  }
}

function render() {
  const projects = readProjects()
  const state = readState()
  const gitInfo = getGitInfo(projects)
  const watcherAlive = isWatcherAlive()

  if (!watcherAlive) {
    respawnWatcher()
  }

  const output = renderDashboard(projects, state, gitInfo, { watcherAlive })

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
  })

  process.stdin.on('data', (key) => {
    if (key === '\u0003') {
      shutdown()
      return
    }
    handleKey(key)
  })

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
