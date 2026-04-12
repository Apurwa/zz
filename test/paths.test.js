import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { expandTilde, contractTilde, CC_DIR, configPath, projectsPath, statePath, lockPath, watcherPidPath, saveTriggerPath } from '../src/paths.js'
import { homedir } from 'node:os'

const HOME = homedir()

describe('paths', () => {
  describe('expandTilde', () => {
    it('expands ~ to home directory', () => {
      assert.equal(expandTilde('~/Projects/foo'), `${HOME}/Projects/foo`)
    })

    it('leaves absolute paths unchanged', () => {
      assert.equal(expandTilde('/usr/local/bin'), '/usr/local/bin')
    })

    it('leaves paths without ~ unchanged', () => {
      assert.equal(expandTilde('relative/path'), 'relative/path')
    })
  })

  describe('contractTilde', () => {
    it('replaces home directory with ~', () => {
      assert.equal(contractTilde(`${HOME}/Projects/foo`), '~/Projects/foo')
    })

    it('leaves non-home paths unchanged', () => {
      assert.equal(contractTilde('/usr/local/bin'), '/usr/local/bin')
    })
  })

  describe('constants', () => {
    it('CC_DIR points to ~/.cc', () => {
      assert.equal(CC_DIR, `${HOME}/.cc`)
    })

    it('all paths are under CC_DIR', () => {
      assert.ok(configPath().startsWith(CC_DIR))
      assert.ok(projectsPath().startsWith(CC_DIR))
      assert.ok(statePath().startsWith(CC_DIR))
      assert.ok(lockPath().startsWith(CC_DIR))
      assert.ok(watcherPidPath().startsWith(CC_DIR))
      assert.ok(saveTriggerPath().startsWith(CC_DIR))
    })
  })
})
