import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseLsofOutput } from '../../src/ports/lsof.js'

describe('ports/lsof', () => {
  it('parses lsof output into entries', () => {
    const output = [
      'COMMAND   PID   USER   FD   TYPE   DEVICE   SIZE/OFF   NODE   NAME',
      'node      1234  user   20u  IPv4   0x1234   0t0        TCP    *:3000 (LISTEN)',
      'postgres  5678  user   10u  IPv4   0x5678   0t0        TCP    127.0.0.1:5432 (LISTEN)',
    ].join('\n')

    const entries = parseLsofOutput(output)
    assert.equal(entries.length, 2)
    assert.equal(entries[0].name, 'node')
    assert.equal(entries[0].pid, 1234)
    assert.equal(entries[0].port, 3000)
    assert.equal(entries[1].name, 'postgres')
    assert.equal(entries[1].port, 5432)
  })

  it('deduplicates by pid:port', () => {
    const output = [
      'COMMAND  PID  USER  FD  TYPE  DEVICE  SIZE  NODE  NAME',
      'node     100  u     1u  IPv4  0x1     0t0   TCP   *:3000 (LISTEN)',
      'node     100  u     2u  IPv6  0x2     0t0   TCP   *:3000 (LISTEN)',
    ].join('\n')

    const entries = parseLsofOutput(output)
    assert.equal(entries.length, 1)
  })

  it('returns empty for no output', () => {
    assert.deepEqual(parseLsofOutput(''), [])
  })

  it('skips non-LISTEN lines', () => {
    const output = [
      'COMMAND  PID  USER  FD  TYPE  DEVICE  SIZE  NODE  NAME',
      'node     100  u     1u  IPv4  0x1     0t0   TCP   *:3000 (ESTABLISHED)',
    ].join('\n')

    assert.deepEqual(parseLsofOutput(output), [])
  })
})

describe('ports/categorize', () => {
  it('sorts into dev, infra, system', async () => {
    const { categorize } = await import('../../src/ports/categorize.js')
    const entries = [
      { name: 'node', pid: 1, port: 3000, host: '*' },
      { name: 'postgres', pid: 2, port: 5432, host: '127.0.0.1' },
      { name: 'launchd', pid: 3, port: 80, host: '*' },
    ]

    const result = categorize(entries)
    assert.equal(result.dev.length, 1)
    assert.equal(result.dev[0].port, 3000)
    assert.equal(result.infra.length, 1)
    assert.equal(result.infra[0].label, 'Postgres')
    assert.equal(result.system.length, 1)
  })
})
