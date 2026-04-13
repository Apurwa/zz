import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('dashboard components', () => {
  it('App module loads', async () => {
    const mod = await import('../../src/dashboard/App.js')
    assert.ok(mod.default)
  })

  it('DashboardView module loads', async () => {
    const mod = await import('../../src/dashboard/DashboardView.js')
    assert.ok(mod.default)
  })

  it('all hooks load', async () => {
    const git = await import('../../src/dashboard/hooks/useGitInfo.js')
    assert.ok(git.useGitInfo)
    const port = await import('../../src/dashboard/hooks/usePortInfo.js')
    assert.ok(port.usePortInfo)
    const watcher = await import('../../src/dashboard/hooks/useWatcherState.js')
    assert.ok(watcher.useWatcherState)
  })

  it('all prompt modules load', async () => {
    const prompts = ['ScanPrompt', 'ManualAddPrompt', 'ChangeScanDirPrompt', 'WorkerPrompt', 'RemovePrompt', 'ShutdownConfirm']
    for (const name of prompts) {
      const mod = await import(`../../src/dashboard/prompts/${name}.js`)
      assert.ok(mod.default, `${name} should have default export`)
    }
  })

  it('view components load', async () => {
    const views = ['Header', 'Footer', 'ErrorBar', 'ProjectTable', 'PortsSection', 'HelpScreen']
    for (const name of views) {
      const mod = await import(`../../src/dashboard/${name}.js`)
      assert.ok(mod.default, `${name} should have default export`)
    }
  })
})
