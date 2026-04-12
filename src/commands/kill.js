import chalk from 'chalk'
import { sessionExists, killSession } from '../tmux.js'
import { releaseLock } from '../state.js'

export default function kill() {
  if (!sessionExists()) {
    console.log(chalk.dim('  No zz session running.'))
    return
  }

  killSession()
  releaseLock()
  console.log(chalk.green('  ✓ Session killed.'))
}
