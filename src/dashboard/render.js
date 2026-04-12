import chalk from 'chalk'
import Table from 'cli-table3'
import { timeSince } from '../paths.js'

export function renderDashboard(projects, state, gitInfo, health, portInfo) {
  const lines = []

  const totalSessions = countSessions(projects, state)
  const savedAgo = state.saved_at ? timeSince(new Date(state.saved_at)) : 'never'

  lines.push('')
  lines.push(
    chalk.bold.cyan('cc') +
    chalk.dim(` · ${projects.length} project${projects.length === 1 ? '' : 's'}`) +
    chalk.dim(` · ${totalSessions} session${totalSessions === 1 ? '' : 's'}`) +
    chalk.dim(` · saved ${savedAgo} ago`)
  )

  if (health.watcherAlive) {
    lines.push(chalk.dim('  watcher healthy'))
  } else {
    lines.push(chalk.red('  ⚠ watcher dead — respawning...'))
  }

  lines.push('')

  if (projects.length === 0) {
    lines.push(chalk.dim('  No projects registered. Press "a" to add one.'))
  } else {
    const table = new Table({
      chars: {
        top: '', 'top-mid': '', 'top-left': '', 'top-right': '',
        bottom: '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
        left: '  ', 'left-mid': '', mid: '', 'mid-mid': '',
        right: '', 'right-mid': '', middle: '  ',
      },
      style: { 'padding-left': 0, 'padding-right': 1 },
      head: [
        chalk.blue('PROJECT'),
        chalk.blue('BRANCH'),
        chalk.blue('SYNC'),
        chalk.blue('SESSIONS'),
        chalk.blue('STATUS'),
        chalk.blue('LAST COMMIT'),
      ],
    })

    for (const project of projects) {
      const stateEntry = state.projects?.[project.path]
      const panes = stateEntry?.panes ?? []
      const activeSessions = panes.filter((p) => p.claude_session_id).length
      const totalPanes = panes.length || (project.workers + 1)
      const git = gitInfo[project.path] ?? { branch: '?', dirty: false, ahead: null, behind: null, lastCommit: '?' }
      const status = getStatus(panes)

      const branchDisplay = git.dirty ? chalk.yellow(git.branch) : git.branch

      let syncDisplay = chalk.dim('--')
      if (git.ahead !== null && git.behind !== null) {
        if (git.ahead === 0 && git.behind === 0) syncDisplay = chalk.dim('=')
        else if (git.ahead > 0 && git.behind > 0) syncDisplay = chalk.cyan(`↑${git.ahead}`) + ' ' + chalk.red(`↓${git.behind}`)
        else if (git.ahead > 0) syncDisplay = chalk.cyan(`↑${git.ahead}`)
        else syncDisplay = chalk.red(`↓${git.behind}`)
      }

      table.push([
        chalk.bold(project.alias),
        branchDisplay,
        syncDisplay,
        `${activeSessions}/${totalPanes}`,
        status,
        chalk.dim(git.lastCommit),
      ])
    }

    lines.push(table.toString())
  }

  // Ports section
  lines.push('')
  if (portInfo === null) {
    lines.push(chalk.dim('  PORTS') + chalk.red('  unavailable'))
  } else if (portInfo.length === 0) {
    lines.push(chalk.dim('  PORTS') + chalk.dim('  none'))
  } else {
    lines.push(chalk.dim('  PORTS'))
    for (const port of portInfo) {
      const portStr = chalk.cyan(`:${port.port}`.padEnd(7))
      const nameStr = chalk.dim(port.label.padEnd(10))
      const cmdStr = (port.command || '').padEnd(22)
      const cwdStr = chalk.dim((port.cwd || '').padEnd(28))
      const uptimeStr = chalk.dim(port.uptime || '')
      lines.push(`  ${portStr} ${nameStr} ${cmdStr} ${cwdStr} ${uptimeStr}`)
    }
  }

  lines.push('')
  lines.push(chalk.dim('  ─'.repeat(28)))
  lines.push(
    chalk.dim('  ') +
    chalk.dim('a') + ' scan  ' +
    chalk.dim('d') + ' scan-dir  ' +
    chalk.dim('w') + ' worker  ' +
    chalk.dim('r') + ' remove  ' +
    chalk.dim('s') + ' save  ' +
    chalk.dim('q') + ' shutdown  ' +
    chalk.dim('?') + ' help'
  )
  lines.push('')

  return lines.join('\n')
}

function getStatus(panes) {
  if (panes.length === 0) return chalk.dim('—')

  const errors = panes.filter((p) => p.status === 'error').length
  const active = panes.filter((p) => p.status === 'active').length
  const expired = panes.filter((p) => p.status === 'expired').length
  const stale = panes.filter((p) => p.status === 'stale').length

  const untracked = panes.filter((p) => p.status === 'untracked').length

  if (errors > 0) return chalk.red('● error')
  if (expired > 0) return chalk.yellow(`● ${expired} expired`)
  if (stale > 0) return chalk.yellow('● stale')
  if (active === panes.length) return chalk.green('● all active')
  if (active > 0 && untracked > 0) return chalk.green(`● ${active} active`) + chalk.dim(` · ${untracked} untracked`)
  if (active > 0) return chalk.green(`● ${active} active`)
  if (untracked > 0) return chalk.dim(`● ${untracked} untracked`)
  return chalk.dim('● ready')
}

function countSessions(projects, state) {
  let count = 0
  for (const project of projects) {
    const entry = state.projects?.[project.path]
    if (entry?.panes) {
      count += entry.panes.filter((p) => p.claude_session_id).length
    }
  }
  return count
}

