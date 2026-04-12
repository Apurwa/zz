import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import chalk from 'chalk'
import { CC_DIR, expandTilde, contractTilde, isGitRepo } from '../paths.js'
import { scaffold, readConfig, readProjects, addProject } from '../config.js'
import { readState, acquireLock, forceLock, isValidSessionId } from '../state.js'
import { assertTmux, sessionExists, tmux, tmuxOut, SESSION, sendKeys, getPaneBaseIndex } from '../tmux.js'

function handleExistingSession(state) {
  console.log(chalk.yellow('  Existing session found with stale Claude processes. Reconnecting and restoring...'))

  const projects = readProjects()
  for (const project of projects) {
    const stateEntry = state.projects?.[project.path]
    if (!stateEntry?.panes) continue

    for (const pane of stateEntry.panes) {
      if (!pane.claude_session_id || !isValidSessionId(pane.claude_session_id)) continue

      const target = `${SESSION}:${project.alias}`
      try {
        sendKeys(target, `claude --resume ${pane.claude_session_id}`)
      } catch {
        sendKeys(target, `echo "Warning: Session ${pane.claude_session_id} expired. Run 'claude' or 'claude --continue' to start."`)
      }
    }
  }

  tmux('attach-session', '-t', SESSION)
}

export default function up() {
  assertTmux()

  // Step 1: Scaffold if needed
  const isFirstRun = !existsSync(CC_DIR)
  if (isFirstRun) {
    scaffold()
  }

  // Step 2: Lock acquisition
  const lock = acquireLock()
  if (!lock.acquired) {
    if (lock.reason === 'running') {
      if (sessionExists()) {
        const state = readState()
        forceLock()
        handleExistingSession(state)
        return
      }
      console.log(chalk.dim('  Stale session detected. Cleaning up...'))
    }
  }

  if (lock.stale) {
    console.log(chalk.dim('  Stale lock cleaned up.'))
  }

  // Step 3: Read state and projects
  const state = readState()
  let projects = readProjects()
  const config = readConfig()

  // Step 4: First-time experience
  if (isFirstRun || projects.length === 0) {
    const cwd = resolve('.')

    if (isGitRepo(cwd)) {
      if (isFirstRun) {
        console.log()
        console.log(chalk.bold('  Welcome to cc — Claude Command Center'))
        console.log()
        console.log(chalk.dim('  No projects registered yet.'))
        console.log(chalk.dim(`  Detected git repo in current directory: ${contractTilde(cwd)}`))
        console.log()
      }

      const alias = cwd.split('/').pop().toLowerCase()
      addProject(undefined, { path: cwd, workers: config.default_workers, alias })
      console.log(chalk.green(`  Adding ${contractTilde(cwd)} with ${config.default_workers} workers...`))
      console.log(chalk.dim(`  Run 'cc add <path>' to add more projects.`))
      console.log()

      projects = readProjects()
    } else {
      console.log()
      console.log(chalk.yellow('  No projects registered. Run \'cc add <path>\' to get started.'))
      console.log()
      process.exit(0)
    }
  }

  if (!state.saved_at) {
    console.log(chalk.dim('  No valid state found. Starting fresh workspace.'))
  }

  console.log(chalk.dim('  Booting workspace...'))

  const base = getPaneBaseIndex()

  // Step 5: Create tmux session with dashboard
  const dashboardPath = new URL('../dashboard/index.js', import.meta.url).pathname
  tmux(
    'new-session', '-d', '-s', SESSION, '-n', 'dashboard',
    '-x', '220', '-y', '50'
  )
  sendKeys(`${SESSION}:dashboard`, `node ${dashboardPath}`)

  // Step 6: Start watcher in hidden pane
  const watcherPath = new URL('../watcher/index.js', import.meta.url).pathname
  tmux('split-window', '-v', '-p', '1', '-t', `${SESSION}:dashboard`)
  // After split, new pane is active — it gets base+1, original is base
  sendKeys(`${SESSION}:dashboard.${base + 1}`, `node ${watcherPath}`)
  tmux('select-pane', '-t', `${SESSION}:dashboard.${base}`)

  // Step 7: Create project windows
  for (const project of projects) {
    const fullPath = expandTilde(project.path)

    if (!existsSync(fullPath)) {
      console.log(chalk.red(`  Warning: ${project.alias}: directory not found at ${project.path}. Skipping.`))
      continue
    }

    tmux('new-window', '-n', project.alias, '-t', SESSION, '-c', fullPath)

    if (project.workers > 0) {
      // Split right for workers (35%)
      tmux('split-window', '-h', '-p', '35', '-t', `${SESSION}:${project.alias}`, '-c', fullPath)

      // Stack additional workers vertically on the right side
      for (let w = 1; w < project.workers; w++) {
        tmux(
          'split-window', '-v',
          '-p', String(Math.floor(100 / (project.workers - w + 1))),
          '-t', `${SESSION}:${project.alias}.${base + 1}`,
          '-c', fullPath
        )
      }
    }

    // Resume sessions from saved state
    const stateEntry = state.projects?.[project.path]
    if (stateEntry?.panes) {
      for (let i = 0; i < stateEntry.panes.length; i++) {
        const pane = stateEntry.panes[i]
        const target = `${SESSION}:${project.alias}.${base + i}`

        if (pane.claude_session_id && isValidSessionId(pane.claude_session_id)) {
          sendKeys(target, `claude --resume ${pane.claude_session_id}`)
        }
      }
    }

    // Focus the orchestrator pane
    tmux('select-pane', '-t', `${SESSION}:${project.alias}.${base}`)
  }

  // Step 8: Create portscout window (named "ports" to avoid alias collision)
  if (config.portscout) {
    tmux('new-window', '-n', 'ports', '-t', SESSION)
    sendKeys(`${SESSION}:ports`, 'portscout watch')
  }

  // Step 9: Create shell window
  const firstProject = projects[0]
  const shellDir = firstProject ? expandTilde(firstProject.path) : process.cwd()
  tmux('new-window', '-n', 'shell', '-t', SESSION, '-c', shellDir)

  // Step 10: Restore focus
  const focusWindow = state.tmux?.focused_window ?? 'dashboard'
  try {
    tmux('select-window', '-t', `${SESSION}:${focusWindow}`)
  } catch {
    tmux('select-window', '-t', `${SESSION}:dashboard`)
  }

  console.log(chalk.green('  Workspace ready. Attaching...'))
  console.log()

  // Step 11: Attach
  tmux('attach-session', '-t', SESSION)
}
