import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('tmux', () => {
  describe('parsePaneList', () => {
    it('parses tmux list-panes output into structured data', async () => {
      const { parsePaneList } = await import('../src/tmux.js')
      const raw = [
        '0 0 12345',
        '0 1 12346',
        '2 0 12347',
        '2 1 12348',
      ].join('\n')

      const result = parsePaneList(raw)
      assert.equal(result.length, 4)
      assert.deepEqual(result[0], { windowIndex: 0, paneIndex: 0, panePid: 12345 })
      assert.deepEqual(result[3], { windowIndex: 2, paneIndex: 1, panePid: 12348 })
    })

    it('handles empty output', async () => {
      const { parsePaneList } = await import('../src/tmux.js')
      assert.deepEqual(parsePaneList(''), [])
    })
  })
})
