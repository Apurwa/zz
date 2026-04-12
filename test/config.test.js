import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('config', () => {
  let tempDir

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cc-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('scaffold', () => {
    it('creates directory and default files', async () => {
      const { scaffold } = await import('../src/config.js')
      scaffold(tempDir)

      const configRaw = readFileSync(join(tempDir, 'config.json'), 'utf-8')
      const config = JSON.parse(configRaw)
      assert.equal(config.default_workers, 2)
      assert.equal(config.auto_save_interval, 30)
      assert.equal(config.portscout, true)

      const projectsRaw = readFileSync(join(tempDir, 'projects.json'), 'utf-8')
      const projects = JSON.parse(projectsRaw)
      assert.deepEqual(projects, [])

      const dirStat = statSync(tempDir)
      assert.equal(dirStat.mode & 0o777, 0o700)
    })
  })

  describe('readConfig', () => {
    it('reads config from disk', async () => {
      const { scaffold, readConfig } = await import('../src/config.js')
      scaffold(tempDir)
      const config = readConfig(tempDir)
      assert.equal(config.default_workers, 2)
    })

    it('returns defaults if file is missing', async () => {
      const { readConfig } = await import('../src/config.js')
      const config = readConfig(tempDir)
      assert.equal(config.default_workers, 2)
    })
  })

  describe('readProjects / addProject / removeProject', () => {
    it('adds and removes projects', async () => {
      const { scaffold, readProjects, addProject, removeProject } = await import('../src/config.js')
      scaffold(tempDir)

      addProject(tempDir, { path: '/tmp/foo', workers: 3, alias: 'foo' })
      let projects = readProjects(tempDir)
      assert.equal(projects.length, 1)
      assert.equal(projects[0].alias, 'foo')
      assert.equal(projects[0].workers, 3)

      addProject(tempDir, { path: '/tmp/bar', workers: 2, alias: 'bar' })
      projects = readProjects(tempDir)
      assert.equal(projects.length, 2)

      removeProject(tempDir, 'foo')
      projects = readProjects(tempDir)
      assert.equal(projects.length, 1)
      assert.equal(projects[0].alias, 'bar')
    })

    it('does not add duplicate paths', async () => {
      const { scaffold, readProjects, addProject } = await import('../src/config.js')
      scaffold(tempDir)

      addProject(tempDir, { path: '/tmp/foo', workers: 2, alias: 'foo' })
      addProject(tempDir, { path: '/tmp/foo', workers: 3, alias: 'foo2' })
      const projects = readProjects(tempDir)
      assert.equal(projects.length, 1)
    })
  })
})
