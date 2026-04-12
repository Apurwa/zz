import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const tmuxAvailable = spawnSync('tmux', ['-V'], { stdio: 'ignore' }).status === 0

describe('integration', { skip: !tmuxAvailable ? 'tmux not available' : false }, () => {
  const CC_BIN = join(process.cwd(), 'bin', 'cc.js')

  it('help command exits 0 and shows usage', () => {
    const result = spawnSync('node', [CC_BIN, '--help'], { encoding: 'utf-8' })
    assert.equal(result.status, 0)
    assert.ok(result.stdout.includes('zz'))
    assert.ok(result.stdout.includes('up'))
    assert.ok(result.stdout.includes('down'))
  })

  it('version command exits 0', () => {
    const result = spawnSync('node', [CC_BIN, '--version'], { encoding: 'utf-8' })
    assert.equal(result.status, 0)
    assert.ok(result.stdout.includes('1.0.0'))
  })

  it('unknown command exits 1', () => {
    const result = spawnSync('node', [CC_BIN, 'bogus'], { encoding: 'utf-8' })
    assert.equal(result.status, 1)
  })

  it('doctor runs without crashing', () => {
    const result = spawnSync('node', [CC_BIN, 'doctor'], { encoding: 'utf-8', timeout: 10000 })
    assert.equal(result.status, 0)
    assert.ok(result.stdout.includes('tmux'))
  })

  it('status runs without crashing', () => {
    const result = spawnSync('node', [CC_BIN, 'status'], { encoding: 'utf-8', timeout: 5000 })
    assert.equal(result.status, 0)
  })

  it('kill reports no session when none running', () => {
    const result = spawnSync('node', [CC_BIN, 'kill'], { encoding: 'utf-8', timeout: 5000 })
    assert.equal(result.status, 0)
    assert.ok(result.stdout.includes('No zz session'))
  })

  it('remove without args exits 1', () => {
    const result = spawnSync('node', [CC_BIN, 'remove'], { encoding: 'utf-8' })
    assert.equal(result.status, 1)
  })

  it('worker without args exits 1', () => {
    const result = spawnSync('node', [CC_BIN, 'worker'], { encoding: 'utf-8' })
    assert.equal(result.status, 1)
  })

  it('open without args exits 1', () => {
    const result = spawnSync('node', [CC_BIN, 'open'], { encoding: 'utf-8' })
    assert.equal(result.status, 1)
  })

  it('add without args exits 1', () => {
    const result = spawnSync('node', [CC_BIN, 'add'], { encoding: 'utf-8' })
    assert.equal(result.status, 1)
  })

  it('selection parser handles ranges', async () => {
    const { parseSelection } = await import('../src/selection.js')
    assert.deepEqual(parseSelection('1-3,5', 5), [1, 2, 3, 5])
    assert.deepEqual(parseSelection('*', 3), [1, 2, 3])
  })

  it('port lsof parser handles empty input', async () => {
    const { parseLsofOutput } = await import('../src/ports/lsof.js')
    assert.deepEqual(parseLsofOutput(''), [])
  })
})
