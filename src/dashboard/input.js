import { createInterface } from 'node:readline'
import { writeFileSync, existsSync, readdirSync, lstatSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'
import { execFileSync } from 'node:child_process'
import chalk from 'chalk'
import { parseSelection } from '../selection.js'
import { addProjectFromArgs } from '../commands/add.js'
import { readConfig, updateConfig, readProjects, addProject, removeProject } from '../config.js'
import { sessionExists, tmuxOut, tmux, SESSION } from '../tmux.js'
import { expandTilde, contractTilde, saveTriggerPath, isGitRepo } from '../paths.js'

export function createInputHandler(callbacks) {
  const { onRender, onShutdown, onInvalidateCache, onPause, onResume } = callbacks

  function pause() { if (onPause) onPause() }
  function resume() { if (onResume) onResume() }

  return async function handleKey(key) {
    switch (key) {
      case 'a':
        pause()
        await handleScanDirectory(onRender, onInvalidateCache)
        resume()
        break
      case 'A':
        pause()
        await handleManualAdd(onRender, onInvalidateCache)
        resume()
        break
      case 'd':
        pause()
        await handleChangeScanDir(onRender)
        resume()
        break
      case 'w':
        pause()
        await handleAddWorker(onRender)
        resume()
        break
      case 'r':
        pause()
        await handleRemoveProject(onRender, onInvalidateCache)
        resume()
        break
      case 's':
        pause()
        handleSaveNow(onRender, resume)
        break
      case 'q':
        pause()
        await handleShutdown(onShutdown, resume)
        break
      case '?':
        pause()
        handleHelp(onRender, resume)
        break
      default:
        break
    }
  }
}

async function handleScanDirectory(onRender, onInvalidateCache) {
  if (process.stdin.isRaw) process.stdin.setRawMode(false)

  const config = readConfig()
  let scanDir = config.scan_dir ? expandTilde(config.scan_dir) : null

  const rl = createInterface({ input: process.stdin, output: process.stdout })

  if (!scanDir || !existsSync(scanDir)) {
    const msg = scanDir
      ? `\n  Directory not found: ${contractTilde(scanDir)}\n  Scan directory: `
      : '\n  Scan directory: '

    scanDir = await new Promise((res) => {
      rl.question(msg, (answer) => {
        const path = answer.trim()
        if (!path) { res(null); return }
        res(expandTilde(path))
      })
    })

    if (!scanDir || !existsSync(scanDir)) {
      rl.close()
      process.stdin.setRawMode(true)
      if (scanDir) process.stdout.write(chalk.red(`  Directory not found: ${scanDir}\n`))
      onRender()
      return
    }

    updateConfig(undefined, { scan_dir: contractTilde(scanDir) })
  }

  const registered = readProjects()
  const registeredPaths = new Set(registered.map((p) => resolve(expandTilde(p.path))))

  let repos = []
  let alreadyAddedCount = 0
  try {
    const entries = readdirSync(scanDir)
    for (const entry of entries) {
      const fullPath = join(scanDir, entry)
      try {
        const stat = lstatSync(fullPath)
        if (!stat.isDirectory()) continue
        if (stat.isSymbolicLink()) continue
      } catch { continue }

      const resolved = resolve(fullPath)
      if (registeredPaths.has(resolved)) {
        alreadyAddedCount++
        continue
      }

      if (isGitRepo(fullPath)) {
        let branch = '?'
        try {
          branch = execFileSync('git', ['-C', fullPath, 'rev-parse', '--abbrev-ref', 'HEAD'],
            { encoding: 'utf-8', timeout: 3000 }).trim()
        } catch { /* ok */ }

        repos.push({ name: basename(fullPath), path: fullPath, branch })
      }
    }
  } catch (err) {
    process.stdout.write(chalk.red(`\n  Failed to scan: ${err.message}\n`))
    rl.close()
    process.stdin.setRawMode(true)
    onRender()
    return
  }

  repos.sort((a, b) => a.name.localeCompare(b.name))

  if (repos.length === 0) {
    process.stdout.write(chalk.dim(`\n  No new git repos found in ${contractTilde(scanDir)}.\n`))
    if (alreadyAddedCount > 0) {
      process.stdout.write(chalk.dim(`  (${alreadyAddedCount} repo${alreadyAddedCount === 1 ? '' : 's'} already added)\n`))
    }
    rl.close()
    process.stdin.setRawMode(true)
    setTimeout(onRender, 1000)
    return
  }

  process.stdout.write(chalk.dim(`\n  Scanning ${contractTilde(scanDir)}...\n\n`))
  repos.forEach((repo, i) => {
    process.stdout.write(`  ${String(i + 1).padStart(2)}. ${repo.name.padEnd(22)} ${chalk.dim(repo.branch)}\n`)
  })
  if (alreadyAddedCount > 0) {
    process.stdout.write(chalk.dim(`  (${alreadyAddedCount} repo${alreadyAddedCount === 1 ? '' : 's'} already added, hidden)\n`))
  }
  process.stdout.write('\n')

  const selection = await new Promise((res) => {
    rl.question('  Select (comma-separated, ranges, or * for all)\n  [m] enter path manually\n  : ', (answer) => {
      res(answer.trim())
    })
  })

  rl.close()
  process.stdin.setRawMode(true)

  if (selection === 'm') {
    await handleManualAdd(onRender, onInvalidateCache)
    return
  }

  const indices = parseSelection(selection, repos.length)
  if (indices.length === 0) {
    onRender()
    return
  }

  process.stdout.write(chalk.dim(`\n  Adding ${indices.length} project${indices.length === 1 ? '' : 's'}...\n`))

  const cfg = readConfig()
  for (const idx of indices) {
    const repo = repos[idx - 1]
    const alias = repo.name.toLowerCase()
    const added = addProject(undefined, { path: repo.path, workers: cfg.default_workers, alias })
    if (added) {
      process.stdout.write(chalk.green(`  + ${alias}\n`))
    }
  }

  if (onInvalidateCache) onInvalidateCache()
  setTimeout(onRender, 1000)
}

async function handleManualAdd(onRender, onInvalidateCache) {
  if (process.stdin.isRaw) process.stdin.setRawMode(false)
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  return new Promise((res) => {
    rl.question('\n  Project path: ', (answer) => {
      rl.close()
      process.stdin.setRawMode(true)

      if (answer.trim()) {
        addProjectFromArgs([answer.trim()], {})
        if (onInvalidateCache) onInvalidateCache()
      }

      onRender()
      res()
    })
  })
}

async function handleChangeScanDir(onRender) {
  if (process.stdin.isRaw) process.stdin.setRawMode(false)
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  const config = readConfig()
  const current = config.scan_dir ? contractTilde(expandTilde(config.scan_dir)) : '(not set)'

  return new Promise((res) => {
    rl.question(`\n  Current scan directory: ${current}\n  New scan directory: `, (answer) => {
      rl.close()
      process.stdin.setRawMode(true)

      if (answer.trim()) {
        const newDir = expandTilde(answer.trim())
        if (existsSync(newDir)) {
          updateConfig(undefined, { scan_dir: contractTilde(newDir) })
          process.stdout.write(chalk.green(`  + Scan directory updated\n`))
        } else {
          process.stdout.write(chalk.red(`  Directory not found: ${answer.trim()}\n`))
        }
      }

      onRender()
      res()
    })
  })
}

async function handleAddWorker(onRender) {
  const projects = readProjects()
  if (projects.length === 0) {
    process.stdout.write(chalk.yellow('\n  No projects registered.\n'))
    setTimeout(onRender, 1000)
    return
  }

  if (projects.length === 1) {
    spawnWorker(projects[0])
    onRender()
    return
  }

  if (process.stdin.isRaw) process.stdin.setRawMode(false)
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  process.stdout.write('\n')
  projects.forEach((p, i) => {
    process.stdout.write(`  ${i + 1}. ${p.alias}\n`)
  })

  return new Promise((res) => {
    rl.question('  Select project: ', (answer) => {
      rl.close()
      process.stdin.setRawMode(true)

      const idx = parseInt(answer, 10) - 1
      if (idx >= 0 && idx < projects.length) {
        spawnWorker(projects[idx])
      }

      onRender()
      res()
    })
  })
}

function spawnWorker(project) {
  if (!sessionExists()) return

  try {
    const paneCount = tmuxOut(
      'list-panes', '-t', `${SESSION}:${project.alias}`, '-F', '#{pane_index}'
    ).split('\n').filter(Boolean).length

    const workerNum = paneCount
    tmux('split-window', '-v', '-p', '30', '-t', `${SESSION}:${project.alias}`)
    process.stdout.write(chalk.green(`  + worker-${workerNum} added to ${project.alias}\n`))
  } catch {
    process.stdout.write(chalk.red(`  x Failed to add worker to ${project.alias}\n`))
  }
}

async function handleRemoveProject(onRender, onInvalidateCache) {
  const projects = readProjects()
  if (projects.length === 0) {
    process.stdout.write(chalk.yellow('\n  No projects to remove.\n'))
    setTimeout(onRender, 1000)
    return
  }

  if (process.stdin.isRaw) process.stdin.setRawMode(false)
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  process.stdout.write('\n')
  projects.forEach((p, i) => {
    process.stdout.write(`  ${i + 1}. ${p.alias}\n`)
  })

  return new Promise((res) => {
    rl.question('  Select project to remove: ', (selAnswer) => {
      const idx = parseInt(selAnswer, 10) - 1
      if (idx < 0 || idx >= projects.length) {
        rl.close()
        process.stdin.setRawMode(true)
        onRender()
        res()
        return
      }

      const project = projects[idx]
      rl.question(`  Remove ${project.alias}? (y/N) `, (confirm) => {
        rl.close()
        process.stdin.setRawMode(true)

        if (confirm.toLowerCase() === 'y') {
          if (sessionExists()) {
            try {
              tmux('kill-window', '-t', `${SESSION}:${project.alias}`)
            } catch { /* window may not exist */ }
          }
          removeProject(undefined, project.alias)
          process.stdout.write(chalk.green(`  + Removed ${project.alias}\n`))
          if (onInvalidateCache) onInvalidateCache()
        }

        onRender()
        res()
      })
    })
  })
}

function handleSaveNow(onRender, resume) {
  process.stdout.write(chalk.dim('\n  saving...\n'))
  writeFileSync(saveTriggerPath(), '', { mode: 0o600 })
  setTimeout(() => {
    process.stdout.write(chalk.green('  saved.\n'))
    if (resume) resume()
    setTimeout(onRender, 500)
  }, 500)
}

async function handleShutdown(onShutdown, resume) {
  if (process.stdin.isRaw) process.stdin.setRawMode(false)
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  return new Promise((res) => {
    rl.question('\n  Shutdown? (y/N) ', (answer) => {
      rl.close()

      if (answer.toLowerCase() === 'y') {
        onShutdown()
      } else {
        process.stdin.setRawMode(true)
        if (resume) resume()
      }

      res()
    })
  })
}

function handleHelp(onRender, resume) {
  process.stdout.write(`
${chalk.bold('  Keyboard Shortcuts')}

  ${chalk.bold('a')}  Scan directory -- find and add git repos
  ${chalk.bold('A')}  Add path manually -- type a project path
  ${chalk.bold('d')}  Change scan directory
  ${chalk.bold('w')}  Add worker -- spawns new worker pane in a project
  ${chalk.bold('r')}  Remove project -- with confirmation
  ${chalk.bold('s')}  Save state now -- triggers immediate save
  ${chalk.bold('q')}  Shutdown -- graceful shutdown with confirmation
  ${chalk.bold('?')}  This help screen

  ${chalk.dim('Press any key to return to dashboard...')}
`)

  const handler = () => {
    process.stdin.removeListener('data', handler)
    if (resume) resume()
    onRender()
  }
  process.stdin.on('data', handler)
}
