import { printHelp, printVersion } from './help.js'

const COMMANDS = {
  up: () => import('./commands/up.js'),
  down: () => import('./commands/down.js'),
  add: () => import('./commands/add.js'),
  remove: () => import('./commands/remove.js'),
  worker: () => import('./commands/worker.js'),
  open: () => import('./commands/open.js'),
  status: () => import('./commands/status.js'),
  kill: () => import('./commands/kill.js'),
  doctor: () => import('./commands/doctor.js'),
}

export async function run(args) {
  const command = args[0]

  if (!command || command === '--help' || command === '-h') {
    printHelp()
    return
  }

  if (command === '--version' || command === '-v') {
    printVersion()
    return
  }

  const loader = COMMANDS[command]
  if (!loader) {
    console.error(`Unknown command: ${command}\nRun 'cc --help' for usage.`)
    process.exit(1)
  }

  const mod = await loader()
  await mod.default(args.slice(1))
}
