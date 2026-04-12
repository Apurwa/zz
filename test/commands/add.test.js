import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import { scaffold, readProjects } from '../../src/config.js'

describe('cc add', () => {
  let tempDir, projectDir

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cc-add-'))
    scaffold(tempDir)
    projectDir = join(tempDir, 'myproject')
    mkdirSync(projectDir)
    execSync('git init', { cwd: projectDir, stdio: 'ignore' })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('adds a project with default alias from directory name', async () => {
    const { addProjectFromArgs } = await import('../../src/commands/add.js')
    await addProjectFromArgs([projectDir], {}, tempDir)
    const projects = readProjects(tempDir)
    assert.equal(projects.length, 1)
    assert.equal(projects[0].alias, 'myproject')
    assert.equal(projects[0].path, projectDir)
  })

  it('adds multiple projects in batch', async () => {
    const secondDir = join(tempDir, 'second')
    mkdirSync(secondDir)
    execSync('git init', { cwd: secondDir, stdio: 'ignore' })

    const { addProjectFromArgs } = await import('../../src/commands/add.js')
    await addProjectFromArgs([projectDir, secondDir], {}, tempDir)
    const projects = readProjects(tempDir)
    assert.equal(projects.length, 2)
  })

  it('rejects non-git directories', async () => {
    const plainDir = join(tempDir, 'plain')
    mkdirSync(plainDir)

    const { addProjectFromArgs } = await import('../../src/commands/add.js')
    const result = await addProjectFromArgs([plainDir], {}, tempDir)
    assert.equal(result.failed.length, 1)
    const projects = readProjects(tempDir)
    assert.equal(projects.length, 0)
  })

  it('respects --workers flag', async () => {
    const { addProjectFromArgs } = await import('../../src/commands/add.js')
    await addProjectFromArgs([projectDir], { workers: 5 }, tempDir)
    const projects = readProjects(tempDir)
    assert.equal(projects[0].workers, 5)
  })
})
