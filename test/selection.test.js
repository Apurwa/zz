import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseSelection } from '../src/selection.js'

describe('parseSelection', () => {
  it('parses single number', () => {
    assert.deepEqual(parseSelection('3', 5), [3])
  })

  it('parses comma-separated numbers', () => {
    assert.deepEqual(parseSelection('1,3,5', 5), [1, 3, 5])
  })

  it('parses range', () => {
    assert.deepEqual(parseSelection('2-4', 5), [2, 3, 4])
  })

  it('parses mixed ranges and numbers', () => {
    assert.deepEqual(parseSelection('1-3,5,8', 10), [1, 2, 3, 5, 8])
  })

  it('handles * as all', () => {
    assert.deepEqual(parseSelection('*', 4), [1, 2, 3, 4])
  })

  it('skips out-of-bounds numbers', () => {
    assert.deepEqual(parseSelection('1,6,3', 4), [1, 3])
  })

  it('handles reversed range by swapping', () => {
    assert.deepEqual(parseSelection('4-2', 5), [2, 3, 4])
  })

  it('returns empty for garbage input', () => {
    assert.deepEqual(parseSelection('abc', 5), [])
  })

  it('returns empty for empty string', () => {
    assert.deepEqual(parseSelection('', 5), [])
  })

  it('deduplicates', () => {
    assert.deepEqual(parseSelection('1,1,2-3,2', 5), [1, 2, 3])
  })

  it('handles spaces around numbers', () => {
    assert.deepEqual(parseSelection(' 1 , 3 ', 5), [1, 3])
  })
})
