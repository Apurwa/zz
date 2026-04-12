import chalk from 'chalk'
import { readProjects } from '../config.js'
import { readState } from '../state.js'
import { sessionExists } from '../tmux.js'
import { contractTilde, timeSince } from '../paths.js'

export default function status() {
  const projects = readProjects()
  const state = readState()
  const running = sessionExists()

  console.log()
  console.log(
    chalk.bold('cc') +
    chalk.dim(` · ${projects.length} project${projects.length === 1 ? '' : 's'}`) +
    chalk.dim(` · ${running ? chalk.green('running') : chalk.red('stopped')}`)
  )

  if (state.saved_at) {
    const ago = timeSince(new Date(state.saved_at))
    console.log(chalk.dim(`  Last saved: ${ago} ago (${state.save_trigger})`))
  }

  console.log()

  if (projects.length === 0) {
    console.log(chalk.dim('  No projects registered. Run: cc add <path>'))
    console.log()
    return
  }

  for (const project of projects) {
    const stateEntry = state.projects[project.path]
    const panes = stateEntry?.panes ?? []
    const activeSessions = panes.filter((p) => p.claude_session_id).length
    const totalPanes = panes.length || (project.workers + 1)

    console.log(
      `  ${chalk.bold(project.alias.padEnd(16))} ` +
      `${contractTilde(project.path).padEnd(30)} ` +
      `${activeSessions}/${totalPanes} sessions`
    )
  }

  console.log()
}

