import chalk from 'chalk'
import { findProject } from '../config.js'
import { expandTilde } from '../paths.js'
import { sessionExists, tmux, tmuxOut, SESSION } from '../tmux.js'

export default function worker(args) {
  const alias = args[0]
  if (!alias) {
    console.error('Usage: cc worker <project>')
    process.exit(1)
  }

  if (!sessionExists()) {
    console.error(chalk.red('  No cc session running. Run "cc up" first.'))
    process.exit(1)
  }

  const project = findProject(undefined, alias)
  if (!project) {
    console.error(chalk.red(`  Project "${alias}" not found.`))
    process.exit(1)
  }

  const fullPath = expandTilde(project.path)

  try {
    const paneCount = tmuxOut(
      'list-panes', '-t', `${SESSION}:${project.alias}`, '-F', '#{pane_index}'
    ).split('\n').filter(Boolean).length

    const workerNum = paneCount

    tmux(
      'split-window', '-v', '-p', '30',
      '-t', `${SESSION}:${project.alias}`,
      '-c', fullPath
    )

    console.log(chalk.green(`  worker-${workerNum} added to ${project.alias}`))
  } catch (error) {
    console.error(chalk.red(`  Failed to add worker: ${error.message}`))
    process.exit(1)
  }
}
