import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('watcher/detect', () => {
  describe('parseClaudeSessionFromArgs', () => {
    it('extracts session ID from --resume flag', async () => {
      const { parseClaudeSessionFromArgs } = await import('../../src/watcher/detect.js')
      const args = 'claude --resume abc-123-def'
      assert.equal(parseClaudeSessionFromArgs(args), 'abc-123-def')
    })

    it('returns null when no --resume flag', async () => {
      const { parseClaudeSessionFromArgs } = await import('../../src/watcher/detect.js')
      assert.equal(parseClaudeSessionFromArgs('claude'), null)
      assert.equal(parseClaudeSessionFromArgs('claude --continue'), null)
    })

    it('returns null for non-claude processes', async () => {
      const { parseClaudeSessionFromArgs } = await import('../../src/watcher/detect.js')
      assert.equal(parseClaudeSessionFromArgs('vim foo.js'), null)
    })
  })

  describe('diffPanes', () => {
    it('detects added panes', async () => {
      const { diffPanes } = await import('../../src/watcher/detect.js')
      const prev = [{ windowIndex: 0, paneIndex: 0, panePid: 100 }]
      const curr = [
        { windowIndex: 0, paneIndex: 0, panePid: 100 },
        { windowIndex: 0, paneIndex: 1, panePid: 200 },
      ]
      const diff = diffPanes(prev, curr)
      assert.equal(diff.added.length, 1)
      assert.equal(diff.added[0].panePid, 200)
      assert.equal(diff.removed.length, 0)
    })

    it('detects removed panes', async () => {
      const { diffPanes } = await import('../../src/watcher/detect.js')
      const prev = [
        { windowIndex: 0, paneIndex: 0, panePid: 100 },
        { windowIndex: 0, paneIndex: 1, panePid: 200 },
      ]
      const curr = [{ windowIndex: 0, paneIndex: 0, panePid: 100 }]
      const diff = diffPanes(prev, curr)
      assert.equal(diff.added.length, 0)
      assert.equal(diff.removed.length, 1)
      assert.equal(diff.removed[0].panePid, 200)
    })
  })

  describe('projectHashFromPath', () => {
    it('converts path to Claude project hash format', async () => {
      const { projectHashFromPath } = await import('../../src/watcher/detect.js')
      const result = projectHashFromPath('/Users/alice/Projects/Foo')
      assert.equal(result, '-Users-alice-Projects-Foo')
    })
  })
})
