import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('watcher/save', () => {
  let tempDir

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cc-save-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('saves state atomically with 0600 permissions', async () => {
    const { saveState } = await import('../../src/watcher/save.js')
    const state = { version: 1, projects: { '/tmp/foo': { panes: [] } } }

    saveState(tempDir, state, 'heartbeat')

    const raw = readFileSync(join(tempDir, 'state.json'), 'utf-8')
    const saved = JSON.parse(raw)
    assert.equal(saved.version, 1)
    assert.equal(saved.save_trigger, 'heartbeat')
    assert.ok(saved.saved_at)

    const stat = statSync(join(tempDir, 'state.json'))
    assert.equal(stat.mode & 0o777, 0o600)
  })

  it('does not leave tmp file on success', async () => {
    const { saveState } = await import('../../src/watcher/save.js')
    saveState(tempDir, { version: 1, projects: {} }, 'test')
    assert.equal(existsSync(join(tempDir, 'state.json.tmp')), false)
  })
})
