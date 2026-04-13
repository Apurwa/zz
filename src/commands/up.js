import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import chalk from 'chalk'
import { CC_DIR, expandTilde, contractTilde, isGitRepo } from '../paths.js'
import { scaffold, readConfig, readProjects, addProject, updateConfig } from '../config.js'
import { readState, acquireLock, forceLock, isValidSessionId } from '../state.js'
import { assertTmux, sessionExists, tmux, tmuxOut, SESSION, sendKeys, getPaneBaseIndex, createProjectWindow } from '../tmux.js'

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

export default async function up() {
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

  // Guard: if session already exists (e.g. prior ccc up failed to attach), just reattach
  if (sessionExists()) {
    console.log(chalk.dim('  Existing session found. Reattaching...'))
    forceLock()
    tmux('attach-session', '-t', SESSION)
    return
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
        console.log(chalk.bold('  Welcome to zz — Claude Command Center'))
        console.log()
        console.log(chalk.dim('  No projects registered yet.'))
        console.log(chalk.dim(`  Detected git repo in current directory: ${contractTilde(cwd)}`))
        console.log()
      }

      const alias = cwd.split('/').pop().toLowerCase()
      addProject(undefined, { path: cwd, workers: config.default_workers, alias })
      console.log(chalk.green(`  Adding ${contractTilde(cwd)} with ${config.default_workers} workers...`))
      console.log(chalk.dim(`  Run 'zz add <path>' to add more projects.`))
      console.log()

      projects = readProjects()
    } else {
      console.log()
      console.log(chalk.dim('  No projects registered.'))
      console.log()

      const { createInterface } = await import('node:readline')
      const rl = createInterface({ input: process.stdin, output: process.stdout })

      const choice = await new Promise((res) => {
        rl.question(
          '  [1] Scan a directory for git repos\n  [2] Enter a project path manually\n  Select: ',
          (answer) => res(answer.trim())
        )
      })

      if (choice === '1') {
        const scanPath = await new Promise((res) => {
          rl.question('  Scan directory: ', (answer) => { res(answer.trim()) })
        })
        rl.close()

        if (!scanPath) process.exit(0)

        const fullScanPath = expandTilde(scanPath)
        if (!existsSync(fullScanPath)) {
          console.log(chalk.red(`  Directory not found: ${scanPath}`))
          process.exit(1)
        }

        updateConfig(undefined, { scan_dir: contractTilde(fullScanPath) })

        const { readdirSync, lstatSync } = await import('node:fs')
        const { join: joinPath, basename: baseName, resolve: resolvePath } = await import('node:path')
        const { execFileSync } = await import('node:child_process')

        const repos = []
        const entries = readdirSync(fullScanPath)
        for (const entry of entries) {
          const fp = joinPath(fullScanPath, entry)
          try {
            const stat = lstatSync(fp)
            if (!stat.isDirectory() || stat.isSymbolicLink()) continue
          } catch { continue }
          if (isGitRepo(fp)) {
            let branch = '?'
            try { branch = execFileSync('git', ['-C', fp, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf-8', timeout: 3000 }).trim() } catch {}
            repos.push({ name: baseName(fp), path: resolvePath(fp), branch })
          }
        }

        repos.sort((a, b) => a.name.localeCompare(b.name))

        if (repos.length === 0) {
          console.log(chalk.dim(`  No git repos found in ${scanPath}.`))
          process.exit(0)
        }

        console.log()
        repos.forEach((r, i) => console.log(`  ${i + 1}. ${r.name.padEnd(22)} ${chalk.dim(r.branch)}`))
        console.log()

        const { parseSelection } = await import('../selection.js')
        const rl2 = (await import('node:readline')).createInterface({ input: process.stdin, output: process.stdout })
        const sel = await new Promise((res) => {
          rl2.question('  Select (comma-separated, ranges, or * for all): ', (a) => { rl2.close(); res(a.trim()) })
        })

        const indices = parseSelection(sel, repos.length)
        if (indices.length === 0) {
          console.log(chalk.dim('  No projects selected.'))
          process.exit(0)
        }

        console.log(chalk.dim(`\n  Adding ${indices.length} project${indices.length === 1 ? '' : 's'}...`))
        for (const idx of indices) {
          const repo = repos[idx - 1]
          addProject(undefined, { path: repo.path, workers: config.default_workers, alias: repo.name.toLowerCase() })
          console.log(chalk.green(`  ✓ ${repo.name.toLowerCase()}`))
        }

        projects = readProjects()
      } else if (choice === '2') {
        const pathInput = await new Promise((res) => {
          rl.question('  Project path: ', (answer) => { rl.close(); res(answer.trim()) })
        })

        if (!pathInput) process.exit(0)

        const { resolve: resolvePath } = await import('node:path')
        const fullPath = resolvePath(expandTilde(pathInput))
        if (!existsSync(fullPath) || !isGitRepo(fullPath)) {
          console.log(chalk.red(`  Not a valid git repo: ${pathInput}`))
          process.exit(1)
        }

        const alias = fullPath.split('/').pop().toLowerCase()
        addProject(undefined, { path: fullPath, workers: config.default_workers, alias })
        console.log(chalk.green(`  ✓ ${alias}`))
        projects = readProjects()
      } else {
        rl.close()
        process.exit(0)
      }

      console.log()
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

  // Step 6: Start watcher in hidden pane (output suppressed, minimized to 1 row)
  const watcherPath = new URL('../watcher/index.js', import.meta.url).pathname
  tmux('split-window', '-v', '-l', '1', '-t', `${SESSION}:dashboard`)
  sendKeys(`${SESSION}:dashboard.${base + 1}`, `node ${watcherPath} >/dev/null 2>&1`)
  tmux('select-pane', '-t', `${SESSION}:dashboard.${base}`)

  // Step 7: Create project windows
  for (const project of projects) {
    const fullPath = expandTilde(project.path)

    if (!existsSync(fullPath)) {
      console.log(chalk.red(`  Warning: ${project.alias}: directory not found at ${project.path}. Skipping.`))
      continue
    }

    createProjectWindow({ alias: project.alias, path: fullPath, workers: project.workers })

    // Resume sessions from saved state
    const stateEntry = state.projects?.[project.path]
    let restoredCount = 0
    let freshCount = 0
    if (stateEntry?.panes) {
      // Dedup: track which session IDs we've already resumed to prevent
      // multiple panes from opening the same conversation
      const resumedIds = new Set()
      for (let i = 0; i < stateEntry.panes.length; i++) {
        const pane = stateEntry.panes[i]
        const target = `${SESSION}:${project.alias}.${base + i}`
        const sid = pane.claude_session_id

        if (sid && isValidSessionId(sid) && !resumedIds.has(sid)) {
          sendKeys(target, `claude --resume ${sid}`)
          resumedIds.add(sid)
          restoredCount++
        } else if (i > 0) {
          // Workers without a unique session get fresh claude
          sendKeys(target, 'claude')
          freshCount++
        }
      }
    }

    if (restoredCount > 0 || freshCount > 0) {
      const parts = []
      if (restoredCount > 0) parts.push(`${restoredCount} restored`)
      if (freshCount > 0) parts.push(`${freshCount} fresh`)
      console.log(chalk.dim(`  ${project.alias}: ${parts.join(', ')}`))
    }

    // Focus the orchestrator pane
    tmux('select-pane', '-t', `${SESSION}:${project.alias}.${base}`)
  }

  // Step 8: Create portscout window (named "ports" to avoid alias collision)
  if (config.portscout_window) {
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
