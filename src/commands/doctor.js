import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import chalk from 'chalk'
import { readProjects } from '../config.js'
import { expandTilde, CC_DIR, configPath, projectsPath, statePath } from '../paths.js'

export default function doctor() {
  console.log()
  console.log(chalk.bold('zz doctor'))
  console.log()

  let issues = 0

  // Check tmux
  const tmuxResult = spawnSync('tmux', ['-V'], { stdio: 'pipe', encoding: 'utf-8' })
  if (tmuxResult.status === 0) {
    console.log(chalk.green('  ✓ tmux') + chalk.dim(` — ${tmuxResult.stdout.trim()}`))
  } else {
    console.log(chalk.red('  ✗ tmux not found'))
    issues++
  }

  // Check claude CLI
  const claudeResult = spawnSync('claude', ['--version'], { stdio: 'pipe', encoding: 'utf-8' })
  if (claudeResult.status === 0) {
    console.log(chalk.green('  ✓ claude') + chalk.dim(` — ${claudeResult.stdout.trim()}`))
  } else {
    console.log(chalk.red('  ✗ claude CLI not found'))
    issues++
  }

  // Check portscout
  const portscoutResult = spawnSync('portscout', ['--version'], { stdio: 'pipe', encoding: 'utf-8' })
  if (portscoutResult.status === 0) {
    console.log(chalk.green('  ✓ portscout') + chalk.dim(` — ${portscoutResult.stdout.trim()}`))
  } else {
    console.log(chalk.yellow('  ⚠ portscout not found') + chalk.dim(' (optional)'))
  }

  // Check ~/.cc/ exists
  if (existsSync(CC_DIR)) {
    console.log(chalk.green('  ✓ ~/.cc/ directory'))
  } else {
    console.log(chalk.yellow('  ⚠ ~/.cc/ not found') + chalk.dim(' — run "zz up" to initialize'))
    issues++
  }

  // Check config files
  for (const [name, path] of [['config.json', configPath()], ['projects.json', projectsPath()]]) {
    if (existsSync(path)) {
      try {
        JSON.parse(readFileSync(path, 'utf-8'))
        console.log(chalk.green(`  ✓ ${name}`))
      } catch {
        console.log(chalk.red(`  ✗ ${name} — invalid JSON`))
        issues++
      }
    } else {
      console.log(chalk.dim(`  - ${name} not found`))
    }
  }

  // Check state.json
  if (existsSync(statePath())) {
    try {
      JSON.parse(readFileSync(statePath(), 'utf-8'))
      console.log(chalk.green('  ✓ state.json'))
    } catch {
      console.log(chalk.red('  ✗ state.json — corrupt'))
      issues++
    }
  } else {
    console.log(chalk.dim('  - state.json not found (normal if never booted)'))
  }

  // Check registered projects
  const projects = readProjects()
  for (const project of projects) {
    const fullPath = expandTilde(project.path)
    if (existsSync(fullPath)) {
      console.log(chalk.green(`  ✓ ${project.alias}`) + chalk.dim(` — ${project.path}`))
    } else {
      console.log(chalk.red(`  ✗ ${project.alias}`) + chalk.dim(` — directory missing: ${project.path}`))
      console.log(chalk.dim(`    Run 'zz remove ${project.alias}' to clean up.`))
      issues++
    }
  }

  console.log()
  if (issues === 0) {
    console.log(chalk.green('  All checks passed.'))
  } else {
    console.log(chalk.yellow(`  ${issues} issue${issues === 1 ? '' : 's'} found.`))
  }
  console.log()
}
