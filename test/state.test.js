import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('state', () => {
  let tempDir

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cc-state-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('readState', () => {
    it('returns empty state if file missing', async () => {
      const { readState } = await import('../src/state.js')
      const state = readState(tempDir)
      assert.equal(state.version, 1)
      assert.deepEqual(state.projects, {})
    })

    it('reads existing state', async () => {
      const { readState } = await import('../src/state.js')
      const data = { version: 1, saved_at: '2026-01-01T00:00:00Z', projects: { '/tmp/foo': {} } }
      writeFileSync(join(tempDir, 'state.json'), JSON.stringify(data))
      const state = readState(tempDir)
      assert.ok(state.projects['/tmp/foo'])
    })

    it('returns empty state on corrupt JSON', async () => {
      const { readState } = await import('../src/state.js')
      writeFileSync(join(tempDir, 'state.json'), '{corrupt')
      const state = readState(tempDir)
      assert.equal(state.version, 1)
      assert.deepEqual(state.projects, {})
    })
  })

  describe('writeState', () => {
    it('writes state atomically', async () => {
      const { writeState, readState } = await import('../src/state.js')
      const state = { version: 1, saved_at: '2026-01-01T00:00:00Z', save_trigger: 'test', tmux: {}, projects: {} }
      writeState(tempDir, state)

      const result = readState(tempDir)
      assert.equal(result.save_trigger, 'test')
    })

    it('sets 0600 permissions', async () => {
      const { writeState } = await import('../src/state.js')
      const { statSync } = await import('node:fs')
      writeState(tempDir, { version: 1, projects: {} })
      const stat = statSync(join(tempDir, 'state.json'))
      assert.equal(stat.mode & 0o777, 0o600)
    })
  })

  describe('lock file', () => {
    it('acquires and releases lock', async () => {
      const { acquireLock, releaseLock } = await import('../src/state.js')
      const result = acquireLock(tempDir)
      assert.equal(result.acquired, true)

      releaseLock(tempDir)
      const lockFile = join(tempDir, 'cc.lock')
      const { existsSync } = await import('node:fs')
      assert.equal(existsSync(lockFile), false)
    })

    it('detects live lock as taken', async () => {
      const { acquireLock } = await import('../src/state.js')
      writeFileSync(join(tempDir, 'cc.lock'), String(process.pid))

      const result = acquireLock(tempDir)
      assert.equal(result.acquired, false)
      assert.equal(result.reason, 'running')
    })

    it('cleans stale lock (dead PID)', async () => {
      const { acquireLock } = await import('../src/state.js')
      writeFileSync(join(tempDir, 'cc.lock'), '99999999')

      const result = acquireLock(tempDir)
      assert.equal(result.acquired, true)
      assert.equal(result.stale, true)
    })
  })
})
