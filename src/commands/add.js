import { resolve, basename } from 'node:path'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import chalk from 'chalk'
import { expandTilde } from '../paths.js'
import { addProject, readConfig } from '../config.js'
import { CC_DIR } from '../paths.js'

function isGitRepo(dir) {
  try {
    execFileSync('git', ['-C', dir, 'rev-parse', '--git-dir'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function parseArgs(args) {
  const paths = []
  const flags = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workers' && args[i + 1]) {
      flags.workers = parseInt(args[i + 1], 10)
      i++
    } else {
      paths.push(args[i])
    }
  }
  return { paths, flags }
}

export function addProjectFromArgs(paths, flags, baseDir = CC_DIR) {
  const config = readConfig(baseDir)
  const workers = flags.workers ?? config.default_workers
  const added = []
  const failed = []

  for (const raw of paths) {
    const fullPath = resolve(expandTilde(raw))

    if (!existsSync(fullPath)) {
      console.error(chalk.red(`  x ${raw}: directory not found`))
      failed.push(raw)
      continue
    }

    if (!isGitRepo(fullPath)) {
      console.error(chalk.red(`  x ${raw}: not a git repository`))
      failed.push(raw)
      continue
    }

    const alias = basename(fullPath).toLowerCase()
    const ok = addProject(baseDir, { path: fullPath, workers, alias })

    if (ok) {
      console.log(chalk.green(`  + ${alias}`) + chalk.dim(` — ${fullPath} (${workers} workers)`))
      added.push(alias)
    } else {
      console.log(chalk.yellow(`  ! ${raw}: already registered`))
      failed.push(raw)
    }
  }

  return { added, failed }
}

export default function add(args) {
  const { paths, flags } = parseArgs(args)

  if (paths.length === 0) {
    console.error('Usage: cc add <path...> [--workers N]')
    process.exit(1)
  }

  addProjectFromArgs(paths, flags)
}
