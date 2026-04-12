import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('dashboard/render', () => {
  it('renders header with project count and session count', async () => {
    const { renderDashboard } = await import('../../src/dashboard/render.js')
    const projects = [
      { alias: 'foo', path: '/tmp/foo', workers: 2 },
    ]
    const state = {
      version: 1,
      saved_at: new Date().toISOString(),
      projects: {
        '/tmp/foo': {
          panes: [
            { role: 'orchestrator', claude_session_id: 'abc', status: 'active' },
            { role: 'worker-1', claude_session_id: null, status: 'ready' },
          ],
        },
      },
    }
    const gitInfo = { '/tmp/foo': { branch: 'main', dirty: false, ahead: 0, behind: 0, lastCommit: '2h ago' } }

    const output = renderDashboard(projects, state, gitInfo, { watcherAlive: true })
    assert.ok(output.includes('1 project'))
    assert.ok(output.includes('foo'))
    assert.ok(output.includes('main'))
  })

  it('shows watcher warning when dead', async () => {
    const { renderDashboard } = await import('../../src/dashboard/render.js')
    const output = renderDashboard([], { version: 1, projects: {} }, {}, { watcherAlive: false })
    assert.ok(output.includes('watcher dead'))
  })
})
