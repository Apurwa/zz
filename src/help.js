import chalk from 'chalk'

export function printHelp() {
  const b = chalk.bold
  const d = chalk.dim
  console.log(`
${b('ccc')} — Claude Command Center

${b('Usage:')}
  ccc <command> [options]

${b('Commands:')}
  ${b('up')}                       Boot workspace from saved state
  ${b('down')}                     Graceful shutdown (save + SIGTERM + kill)
  ${b('add')} <path...> [--workers N]  Register project(s)
  ${b('remove')} <project>          Unregister a project
  ${b('worker')} <project>          Spawn a new worker pane
  ${b('open')} <project>            Jump to project window
  ${b('status')}                    Print workspace summary
  ${b('kill')}                      Hard teardown (no save)
  ${b('doctor')}                    Validate environment + state

${b('Examples:')}
  ccc up                        ${d('# boot/restore workspace')}
  ccc add ~/Projects/api        ${d('# register a project')}
  ccc add ~/Projects/a ~/Projects/b --workers 3
  ccc worker api                ${d('# add worker pane to project')}
  ccc open api                  ${d('# jump to project window')}
  ccc down                      ${d('# graceful shutdown')}
`)
}

export function printVersion() {
  console.log('ccc 1.0.0')
}
