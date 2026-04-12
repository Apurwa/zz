import { execFileSync } from 'node:child_process'
import { writeFileSync, readFileSync } from 'node:fs'
import chalk from 'chalk'
import { releaseLock, readState } from '../state.js'
import { saveTriggerPath, watcherPidPath } from '../paths.js'
import { sessionExists, tmuxOut, killSession, SESSION } from '../tmux.js'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export default async function down() {
  if (!sessionExists()) {
    console.log(chalk.dim('  No cc session running.'))
    return
  }

  console.log(chalk.dim('  Shutting down...'))

  // Step 1: Trigger final state save
  try {
    writeFileSync(saveTriggerPath(), '', { mode: 0o600 })
    await sleep(1000)
  } catch {
    // Watcher may already be dead
  }

  // Step 2: Send SIGTERM to all Claude processes in project panes
  try {
    const panes = tmuxOut(
      'list-panes', '-s', '-t', SESSION,
      '-F', '#{pane_pid}'
    )

    const pids = panes.split('\n').filter(Boolean).map(Number)

    for (const shellPid of pids) {
      try {
        const children = execFileSync(
          'pgrep', ['-P', String(shellPid)],
          { encoding: 'utf-8', timeout: 3000 }
        ).trim()

        for (const childPid of children.split('\n').filter(Boolean)) {
          try {
            process.kill(parseInt(childPid, 10), 'SIGTERM')
          } catch {
            // Process may have already exited
          }
        }
      } catch {
        // No children
      }
    }
  } catch {
    // Session may be in a bad state
  }

  // Step 2.5: Fallback — if watcher is dead, save state directly
  try {
    const watcherPid = parseInt(readFileSync(watcherPidPath(), 'utf-8').trim(), 10)
    process.kill(watcherPid, 0)
  } catch {
    try {
      const { saveState } = await import('../watcher/save.js')
      const currentState = readState()
      saveState(undefined, currentState, 'shutdown')
    } catch {
      // Best-effort save
    }
  }

  // Step 3: Wait for processes to exit
  console.log(chalk.dim('  Waiting for processes to exit...'))
  await sleep(5000)

  // Step 4: Kill tmux session
  killSession()
  console.log(chalk.dim('  Session terminated.'))

  // Step 5: Release lock
  releaseLock()
  console.log(chalk.green('  Shutdown complete.'))
}
