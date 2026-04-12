import chalk from 'chalk'
import { removeProject, findProject } from '../config.js'
import { sessionExists, tmuxOut, SESSION } from '../tmux.js'

export default function remove(args) {
  const alias = args[0]
  if (!alias) {
    console.error('Usage: cc remove <project>')
    process.exit(1)
  }

  const project = findProject(undefined, alias)
  if (!project) {
    console.error(chalk.red(`Project "${alias}" not found.`))
    process.exit(1)
  }

  if (sessionExists()) {
    try {
      const windows = tmuxOut('list-windows', '-t', SESSION, '-F', '#{window_name}')
      if (windows.split('\n').includes(project.alias)) {
        tmuxOut('kill-window', '-t', `${SESSION}:${project.alias}`)
        console.log(chalk.dim(`  Closed tmux window: ${project.alias}`))
      }
    } catch {
      // Window may not exist
    }
  }

  const removed = removeProject(undefined, alias)
  if (removed) {
    console.log(chalk.green(`  ✓ Removed ${alias}`))
  }
}
