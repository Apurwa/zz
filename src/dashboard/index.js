import React from 'react'
import { render } from 'ink'
import { appendFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CC_DIR } from '../paths.js'

const LOG_PATH = join(CC_DIR, 'dashboard.log')
const MAX_LOG_SIZE = 50 * 1024

function logError(context, err) {
  const msg = `[${new Date().toISOString()}] ${context}: ${err?.message ?? err}\n`
  try {
    try {
      const { size } = statSync(LOG_PATH)
      if (size > MAX_LOG_SIZE) writeFileSync(LOG_PATH, '')
    } catch { /* file may not exist */ }
    appendFileSync(LOG_PATH, msg)
  } catch { /* can't log */ }
}

// Graceful exit handlers
process.stdout.on('error', (err) => {
  logError('stdout', err)
  if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') {
    process.exit(0)
  }
})

process.on('unhandledRejection', (err) => {
  logError('unhandledRejection', err)
})

process.on('exit', (code) => {
  if (code !== 0) {
    try {
      process.stderr.write(`\nDashboard exited unexpectedly (code ${code}). See ~/.cc/dashboard.log\n`)
    } catch { /* stream may be closed */ }
  }
})

async function main() {
  const { default: App } = await import('./App.js')
  render(React.createElement(App), { exitOnCtrlC: false })
}

main().catch((err) => {
  logError('startup', err)
  process.exit(1)
})
