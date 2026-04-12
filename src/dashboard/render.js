import chalk from 'chalk'
import Table from 'cli-table3'

export function renderDashboard(projects, state, gitInfo, health) {
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
      const git = gitInfo[project.path] ?? { branch: '?', lastCommit: '?' }
      const status = getStatus(panes)

      table.push([
        chalk.bold(project.alias),
        chalk.yellow(git.branch),
        `${activeSessions}/${totalPanes}`,
        status,
        chalk.dim(git.lastCommit),
      ])
    }

    lines.push(table.toString())
  }

  lines.push('')
  lines.push(chalk.dim('  ─'.repeat(28)))
  lines.push(
    chalk.dim('  ') +
    chalk.dim('a') + ' add project  ' +
    chalk.dim('w') + ' add worker  ' +
    chalk.dim('r') + ' remove project'
  )
  lines.push(
    chalk.dim('  ') +
    chalk.dim('s') + ' save now     ' +
    chalk.dim('q') + ' shutdown    ' +
    chalk.dim('?') + ' help'
  )
  lines.push('')

  return lines.join('\n')
}

function getStatus(panes) {
  if (panes.length === 0) return chalk.dim('—')

  const active = panes.filter((p) => p.status === 'active').length
  const expired = panes.filter((p) => p.status === 'expired').length
  const stale = panes.filter((p) => p.status === 'stale').length

  if (expired > 0) return chalk.yellow(`● ${expired} expired`)
  if (stale > 0) return chalk.yellow('● stale')
  if (active === panes.length) return chalk.green('● all active')
  if (active > 0) return chalk.green(`● ${active} active`)
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

function timeSince(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}
