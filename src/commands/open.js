import chalk from 'chalk'
import { findProject } from '../config.js'
import { sessionExists, tmux, SESSION } from '../tmux.js'

export default function open(args) {
  const alias = args[0]
  if (!alias) {
    console.error('Usage: cc open <project>')
    process.exit(1)
  }

  if (!sessionExists()) {
    console.error(chalk.red('  No cc session running. Run "cc up" first.'))
    process.exit(1)
  }

  const specialWindows = ['dashboard', 'portscout', 'shell']
  if (specialWindows.includes(alias)) {
    tmux('select-window', '-t', `${SESSION}:${alias}`)
    return
  }

  const project = findProject(undefined, alias)
  if (!project) {
    console.error(chalk.red(`  Project "${alias}" not found. Available: dashboard, portscout, shell, or a project alias.`))
    process.exit(1)
  }

  try {
    tmux('select-window', '-t', `${SESSION}:${project.alias}`)
  } catch {
    console.error(chalk.red(`  Window for "${alias}" not found in session.`))
    process.exit(1)
  }
}
