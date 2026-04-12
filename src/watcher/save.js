import { writeFileSync, renameSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { CC_DIR } from '../paths.js'

export function saveState(baseDir = CC_DIR, state, trigger) {
  const file = join(baseDir, 'state.json')
  const tmpFile = join(baseDir, 'state.json.tmp')

  const data = {
    ...state,
    saved_at: new Date().toISOString(),
    save_trigger: trigger,
  }

  writeFileSync(tmpFile, JSON.stringify(data, null, 2) + '\n', 'utf-8')
  chmodSync(tmpFile, 0o600)
  renameSync(tmpFile, file)
}
