import { createInterface } from 'node:readline'
import { writeFileSync } from 'node:fs'
import chalk from 'chalk'
import { addProjectFromArgs } from '../commands/add.js'
import { readProjects, removeProject } from '../config.js'
import { sessionExists, tmuxOut, tmux, SESSION } from '../tmux.js'
import { saveTriggerPath } from '../paths.js'

export function createInputHandler(callbacks) {
  const { onRender, onShutdown } = callbacks

  return async function handleKey(key) {
    switch (key) {
      case 'a':
        await handleAddProject(onRender)
        break
      case 'w':
        await handleAddWorker(onRender)
        break
      case 'r':
        await handleRemoveProject(onRender)
        break
      case 's':
        handleSaveNow(onRender)
        break
      case 'q':
        await handleShutdown(onShutdown)
        break
      case '?':
        handleHelp(onRender)
        break
      default:
        break
    }
  }
}

async function handleAddProject(onRender) {
  if (process.stdin.isRaw) process.stdin.setRawMode(false)

  const rl = createInterface({ input: process.stdin, output: process.stdout })

  return new Promise((resolve) => {
    rl.question('\n  Project path: ', (answer) => {
      rl.close()
      process.stdin.setRawMode(true)

      if (answer.trim()) {
        addProjectFromArgs([answer.trim()], {})
      }

      onRender()
      resolve()
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

  return new Promise((resolve) => {
    rl.question('  Select project: ', (answer) => {
      rl.close()
      process.stdin.setRawMode(true)

      const idx = parseInt(answer, 10) - 1
      if (idx >= 0 && idx < projects.length) {
        spawnWorker(projects[idx])
      }

      onRender()
      resolve()
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
    process.stdout.write(chalk.green(`  ✓ worker-${workerNum} added to ${project.alias}\n`))
  } catch {
    process.stdout.write(chalk.red(`  ✗ Failed to add worker to ${project.alias}\n`))
  }
}

async function handleRemoveProject(onRender) {
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

  return new Promise((resolve) => {
    rl.question('  Select project to remove: ', (selAnswer) => {
      const idx = parseInt(selAnswer, 10) - 1
      if (idx < 0 || idx >= projects.length) {
        rl.close()
        process.stdin.setRawMode(true)
        onRender()
        resolve()
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
          process.stdout.write(chalk.green(`  ✓ Removed ${project.alias}\n`))
        }

        onRender()
        resolve()
      })
    })
  })
}

function handleSaveNow(onRender) {
  process.stdout.write(chalk.dim('\n  saving...\n'))
  writeFileSync(saveTriggerPath(), '')
  setTimeout(() => {
    process.stdout.write(chalk.green('  saved.\n'))
    setTimeout(onRender, 500)
  }, 500)
}

async function handleShutdown(onShutdown) {
  if (process.stdin.isRaw) process.stdin.setRawMode(false)
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  return new Promise((resolve) => {
    rl.question('\n  Shutdown? (y/N) ', (answer) => {
      rl.close()

      if (answer.toLowerCase() === 'y') {
        onShutdown()
      } else {
        process.stdin.setRawMode(true)
      }

      resolve()
    })
  })
}

function handleHelp(onRender) {
  process.stdout.write(`
${chalk.bold('  Keyboard Shortcuts')}

  ${chalk.bold('a')}  Add project — prompts for path, validates git repo
  ${chalk.bold('w')}  Add worker — spawns new worker pane in a project
  ${chalk.bold('r')}  Remove project — with confirmation
  ${chalk.bold('s')}  Save state now — triggers immediate save
  ${chalk.bold('q')}  Shutdown — graceful shutdown with confirmation
  ${chalk.bold('?')}  This help screen

  ${chalk.dim('Press any key to return to dashboard...')}
`)

  const handler = () => {
    process.stdin.removeListener('data', handler)
    onRender()
  }
  process.stdin.on('data', handler)
}
