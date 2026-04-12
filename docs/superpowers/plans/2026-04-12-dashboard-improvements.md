# Dashboard Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add directory scanner for easy project adding, enriched git status (dirty/sync indicators), and inline port visibility to the dashboard.

**Architecture:** Three independent features layered onto the existing dashboard. Selection parser and port modules are new standalone units. Git and port data use parallel collection with 5-second caching. All rendering flows through the existing `renderDashboard` function with expanded parameters.

**Tech Stack:** Node.js 18+ ESM, chalk, cli-table3, lsof (system), git (system)

---

## File Map

| File | Responsibility |
|---|---|
| `src/selection.js` (new) | Pure function `parseSelection(input, max)` — parses "1,3,5-8,*" into array of indices |
| `src/ports/lsof.js` (new) | `getListeningPorts()` — runs lsof, parses TCP LISTEN entries |
| `src/ports/categorize.js` (new) | `categorize(entries)` — sorts ports into dev/infra/system buckets |
| `src/ports/process.js` (new) | `getProcessDetails(pids)`, `getStartTimes(pids)`, `formatUptime()` — command, cwd, uptime |
| `src/config.js` (modify) | Add `scan_dir` and `portscout_window` to defaults; add `updateConfig()` |
| `src/dashboard/render.js` (modify) | Add SYNC column, dirty branch coloring, PORTS section, updated footer |
| `src/dashboard/index.js` (modify) | Parallel git collection with 5s cache, port data collection, pass ports to render |
| `src/dashboard/input.js` (modify) | Rewrite `a` to scan, add `d`/`A` handlers, scanner list with selection |
| `src/commands/up.js` (modify) | First-run scan/manual menu, skip ports window when `portscout_window` is false |
| `test/selection.test.js` (new) | Unit tests for parseSelection |
| `test/ports/lsof.test.js` (new) | Unit tests for parseLsofOutput |

---

### Task 1: Selection Parser

**Files:**
- Create: `src/selection.js`
- Create: `test/selection.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/selection.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/selection.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Create `src/selection.js`:

```js
/**
 * Parse a selection string into an array of 1-based indices.
 * Supports: single numbers (3), comma-separated (1,3,5),
 * ranges (2-4), mixed (1-3,5,8), and * for all.
 *
 * @param {string} input - User input string
 * @param {number} max - Maximum valid index (1-based)
 * @returns {number[]} Sorted, deduplicated array of valid indices
 */
export function parseSelection(input, max) {
  const trimmed = input.trim()
  if (!trimmed) return []

  if (trimmed === '*') {
    return Array.from({ length: max }, (_, i) => i + 1)
  }

  const result = new Set()
  const parts = trimmed.split(',')

  for (const part of parts) {
    const rangeParts = part.trim().split('-')

    if (rangeParts.length === 2) {
      let start = parseInt(rangeParts[0], 10)
      let end = parseInt(rangeParts[1], 10)
      if (isNaN(start) || isNaN(end)) continue
      if (start > end) [start, end] = [end, start]
      for (let i = start; i <= end; i++) {
        if (i >= 1 && i <= max) result.add(i)
      }
    } else {
      const num = parseInt(part.trim(), 10)
      if (!isNaN(num) && num >= 1 && num <= max) {
        result.add(num)
      }
    }
  }

  return [...result].sort((a, b) => a - b)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/selection.test.js`
Expected: All 11 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/selection.js test/selection.test.js
git commit -m "feat: selection parser — numbers, ranges, mixed, wildcard"
```

---

### Task 2: Port Modules (lsof + categorize + process)

**Files:**
- Create: `src/ports/lsof.js`
- Create: `src/ports/categorize.js`
- Create: `src/ports/process.js`
- Create: `test/ports/lsof.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/ports/lsof.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ports/lsof.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/ports/lsof.js`**

```js
import { execFile } from 'node:child_process'

export function getListeningPorts() {
  return new Promise((resolve) => {
    execFile(
      'lsof',
      ['-i', '-P', '-n', '-sTCP:LISTEN', '+c0'],
      { timeout: 3000 },
      (error, stdout) => {
        if (error) {
          resolve([])
          return
        }
        resolve(parseLsofOutput(stdout))
      },
    )
  })
}

export function parseLsofOutput(output) {
  const lines = output.split('\n').filter(Boolean)
  if (lines.length < 2) return []

  const entries = []
  const seen = new Set()

  for (let i = 1; i < lines.length; i++) {
    const parsed = parseLsofLine(lines[i])
    if (!parsed) continue

    const key = `${parsed.pid}:${parsed.port}`
    if (seen.has(key)) continue
    seen.add(key)

    entries.push(parsed)
  }

  return entries
}

function parseLsofLine(line) {
  if (!line.includes('(LISTEN)')) return null

  const parts = line.trim().split(/\s+/)
  if (parts.length < 9) return null

  const name = parts[0]
  const pid = parseInt(parts[1], 10)
  if (isNaN(pid)) return null

  const namePart = parts[parts.length - 2]
  const colonIdx = namePart.lastIndexOf(':')
  if (colonIdx === -1) return null

  const host = namePart.slice(0, colonIdx)
  const port = parseInt(namePart.slice(colonIdx + 1), 10)
  if (isNaN(port)) return null

  return { name, pid, port, host }
}
```

- [ ] **Step 4: Create `src/ports/categorize.js`**

```js
const INFRA_NAMES = new Map([
  ['redis-server', 'Redis'],
  ['postgres', 'Postgres'],
  ['mysqld', 'MySQL'],
  ['mongod', 'MongoDB'],
  ['ollama', 'Ollama'],
])

const INFRA_ORDER = ['Redis', 'Postgres', 'MySQL', 'MongoDB', 'Ollama']
const DEV_PROCESS_NAMES = new Set(['node', 'Python', 'python3', 'python', 'deno', 'bun'])

export function categorize(entries) {
  const dev = []
  const infra = []
  const system = []

  for (const entry of entries) {
    const infraLabel = INFRA_NAMES.get(entry.name.toLowerCase())
    if (infraLabel) {
      infra.push({ ...entry, category: 'infra', label: infraLabel })
    } else if (DEV_PROCESS_NAMES.has(entry.name) && entry.port > 1024) {
      dev.push({ ...entry, category: 'dev', label: entry.name })
    } else {
      system.push({ ...entry, category: 'system', label: entry.name })
    }
  }

  dev.sort((a, b) => a.port - b.port)
  infra.sort((a, b) => INFRA_ORDER.indexOf(a.label) - INFRA_ORDER.indexOf(b.label))
  system.sort((a, b) => a.port - b.port)

  return { dev, infra, system }
}
```

- [ ] **Step 5: Create `src/ports/process.js`**

```js
import { execFile } from 'node:child_process'
import { homedir } from 'node:os'

const HOME = homedir()

export function getStartTimes(pids) {
  if (pids.length === 0) return Promise.resolve(new Map())

  return new Promise((resolve) => {
    execFile(
      'ps', ['-p', pids.join(','), '-o', 'pid=,lstart='],
      { timeout: 3000 },
      (error, stdout) => {
        if (error) { resolve(new Map()); return }
        const result = new Map()
        for (const line of stdout.split('\n').filter(Boolean)) {
          const match = line.trim().match(/^(\d+)\s+(.+)$/)
          if (!match) continue
          const pid = parseInt(match[1], 10)
          const startDate = new Date(match[2])
          if (!isNaN(startDate.getTime())) result.set(pid, startDate)
        }
        resolve(result)
      },
    )
  })
}

export function getProcessDetails(pids) {
  if (pids.length === 0) return Promise.resolve(new Map())

  return Promise.all([getCommands(pids), getCwds(pids)]).then(([commands, cwds]) => {
    const result = new Map()
    for (const pid of pids) {
      result.set(pid, {
        command: commands.get(pid) ?? '',
        cwd: cwds.get(pid) ?? '',
      })
    }
    return result
  })
}

function getCommands(pids) {
  return new Promise((resolve) => {
    execFile(
      'ps', ['-p', pids.join(','), '-o', 'pid=,args='],
      { timeout: 3000 },
      (error, stdout) => {
        if (error) { resolve(new Map()); return }
        const result = new Map()
        for (const line of stdout.split('\n').filter(Boolean)) {
          const match = line.trim().match(/^(\d+)\s+(.+)$/)
          if (!match) continue
          result.set(parseInt(match[1], 10), formatCommand(match[2]))
        }
        resolve(result)
      },
    )
  })
}

function getCwds(pids) {
  return new Promise((resolve) => {
    execFile(
      'lsof', ['-p', pids.join(','), '-a', '-d', 'cwd', '-Fn'],
      { timeout: 3000 },
      (error, stdout) => {
        if (error) { resolve(new Map()); return }
        const result = new Map()
        let currentPid = null
        for (const line of stdout.split('\n')) {
          if (line.startsWith('p')) currentPid = parseInt(line.slice(1), 10)
          else if (line.startsWith('n') && currentPid !== null) result.set(currentPid, formatCwd(line.slice(1)))
        }
        resolve(result)
      },
    )
  })
}

function formatCommand(args) {
  const parts = args.split(/\s+/)
  let startIdx = 0
  if (parts[0].endsWith('node') || parts[0].endsWith('python3') || parts[0].endsWith('python')) {
    startIdx = 1
  }

  const meaningful = parts.slice(startIdx).map((p) => {
    if (p.startsWith('/') || p.startsWith('.')) return p.split('/').pop()
    if (p === '-m' && startIdx > 0) return ''
    return p
  }).filter(Boolean).join(' ')

  return meaningful.length > 30 ? meaningful.slice(0, 27) + '...' : meaningful
}

function formatCwd(cwd) {
  return cwd.startsWith(HOME) ? '~' + cwd.slice(HOME.length) : cwd
}

export function formatUptime(startDate) {
  const totalMinutes = Math.floor((Date.now() - startDate.getTime()) / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}h ${String(minutes).padStart(2, '0')}m`
}
```

- [ ] **Step 6: Run tests**

Run: `node --test test/ports/lsof.test.js`
Expected: All 6 tests PASS.

- [ ] **Step 7: Commit**

```bash
mkdir -p test/ports
git add src/ports/lsof.js src/ports/categorize.js src/ports/process.js test/ports/lsof.test.js
git commit -m "feat: port modules — lsof parsing, categorization, process details"
```

---

### Task 3: Config Update

**Files:**
- Modify: `src/config.js`

- [ ] **Step 1: Add `scan_dir`, `portscout_window`, and `updateConfig` to config.js**

In `src/config.js`, update `DEFAULT_CONFIG`:

```js
const DEFAULT_CONFIG = {
  default_workers: 2,
  auto_save_interval: 30,
  portscout_window: false,
  scan_dir: null,
}
```

Add `updateConfig` function after `readConfig`:

```js
export function updateConfig(baseDir = CC_DIR, updates) {
  const current = readConfig(baseDir)
  const updated = { ...current, ...updates }
  writeSecure(join(baseDir, 'config.json'), updated)
  return updated
}
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `npm test`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/config.js
git commit -m "feat: add scan_dir, portscout_window config fields and updateConfig"
```

---

### Task 4: Enhanced Git Status in Dashboard

**Files:**
- Modify: `src/dashboard/index.js`
- Modify: `src/dashboard/render.js`

- [ ] **Step 1: Rewrite `getGitInfo` in `src/dashboard/index.js` to collect dirty + ahead/behind in parallel with 5s caching**

Replace the existing `getGitInfo` function with:

```js
import { execFile } from 'node:child_process'

let gitCache = {}
let gitCacheTime = 0
const GIT_CACHE_TTL = 5000

function gitCmd(args, cwd) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, encoding: 'utf-8', timeout: 3000 }, (err, stdout) => {
      resolve(err ? null : stdout.trim())
    })
  })
}

async function getGitInfoForProject(projectPath) {
  const [branch, porcelain, revList, lastCommit] = await Promise.all([
    gitCmd(['rev-parse', '--abbrev-ref', 'HEAD'], projectPath),
    gitCmd(['status', '--porcelain'], projectPath),
    gitCmd(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], projectPath),
    gitCmd(['log', '-1', '--format=%cr'], projectPath),
  ])

  const dirty = porcelain !== null && porcelain.length > 0
  let ahead = null
  let behind = null
  if (revList) {
    const parts = revList.split('\t')
    ahead = parseInt(parts[0], 10) || 0
    behind = parseInt(parts[1], 10) || 0
  }

  return {
    branch: branch ?? '?',
    dirty,
    ahead,
    behind,
    lastCommit: lastCommit ?? '?',
  }
}

export async function getGitInfo(projects) {
  const now = Date.now()
  if (now - gitCacheTime < GIT_CACHE_TTL && Object.keys(gitCache).length > 0) {
    return gitCache
  }

  const entries = await Promise.all(
    projects.map(async (project) => {
      const fullPath = expandTilde(project.path)
      const info = await getGitInfoForProject(fullPath)
      return [project.path, info]
    })
  )

  gitCache = Object.fromEntries(entries)
  gitCacheTime = now
  return gitCache
}

export function invalidateGitCache() {
  gitCacheTime = 0
}
```

Note: the existing synchronous `getGitInfo` using `execFileSync` must be replaced. The render function needs to become async, and the `setInterval` render call needs to handle the async render.

Update the `render` function to be async:

```js
async function render() {
  const projects = readProjects()
  const state = readState()
  const gitInfo = await getGitInfo(projects)
  const watcherAlive = isWatcherAlive()

  if (!watcherAlive) {
    respawnWatcher()
  }

  const output = renderDashboard(projects, state, gitInfo, { watcherAlive })

  process.stdout.write('\x1B[2J\x1B[H')
  process.stdout.write(output)
}
```

- [ ] **Step 2: Update `renderDashboard` in `src/dashboard/render.js` to show dirty branch coloring and SYNC column**

Add SYNC to table headers:

```js
head: [
  chalk.blue('PROJECT'),
  chalk.blue('BRANCH'),
  chalk.blue('SYNC'),
  chalk.blue('SESSIONS'),
  chalk.blue('STATUS'),
  chalk.blue('LAST COMMIT'),
],
```

Update the row rendering:

```js
const branchDisplay = git.dirty ? chalk.yellow(git.branch) : git.branch

let syncDisplay = chalk.dim('--')
if (git.ahead !== null && git.behind !== null) {
  if (git.ahead === 0 && git.behind === 0) syncDisplay = chalk.dim('=')
  else if (git.ahead > 0 && git.behind > 0) syncDisplay = chalk.cyan(`↑${git.ahead}`) + ' ' + chalk.red(`↓${git.behind}`)
  else if (git.ahead > 0) syncDisplay = chalk.cyan(`↑${git.ahead}`)
  else syncDisplay = chalk.red(`↓${git.behind}`)
}

table.push([
  chalk.bold(project.alias),
  branchDisplay,
  syncDisplay,
  `${activeSessions}/${totalPanes}`,
  status,
  chalk.dim(git.lastCommit),
])
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All tests PASS (dashboard render test may need update for new column).

- [ ] **Step 4: Commit**

```bash
git add src/dashboard/index.js src/dashboard/render.js
git commit -m "feat: enhanced git status — dirty branch coloring and SYNC column"
```

---

### Task 5: Inline Port Visibility in Dashboard

**Files:**
- Modify: `src/dashboard/index.js`
- Modify: `src/dashboard/render.js`

- [ ] **Step 1: Add port data collection to `src/dashboard/index.js`**

Add imports and port cache:

```js
import { getListeningPorts } from '../ports/lsof.js'
import { categorize } from '../ports/categorize.js'
import { getProcessDetails, getStartTimes, formatUptime } from '../ports/process.js'

let portCache = null
let portCacheTime = 0
const PORT_CACHE_TTL = 5000

async function getPortInfo() {
  const now = Date.now()
  if (portCache && now - portCacheTime < PORT_CACHE_TTL) {
    return portCache
  }

  try {
    const entries = await getListeningPorts()
    const categorized = categorize(entries)
    const allPorts = [...categorized.dev, ...categorized.infra]
    const pids = [...new Set(allPorts.map((p) => p.pid))]

    const [details, startTimes] = await Promise.all([
      getProcessDetails(pids),
      getStartTimes(pids),
    ])

    const enriched = allPorts.map((entry) => {
      const detail = details.get(entry.pid) ?? { command: '', cwd: '' }
      const startTime = startTimes.get(entry.pid)
      return {
        ...entry,
        command: detail.command,
        cwd: detail.cwd,
        uptime: startTime ? formatUptime(startTime) : '',
      }
    })

    portCache = enriched
    portCacheTime = now
    return enriched
  } catch {
    return null
  }
}

export function invalidatePortCache() {
  portCacheTime = 0
}
```

Update the `render` function to pass port data:

```js
async function render() {
  const projects = readProjects()
  const state = readState()
  const [gitInfo, portInfo] = await Promise.all([
    getGitInfo(projects),
    getPortInfo(),
  ])
  const watcherAlive = isWatcherAlive()

  if (!watcherAlive) {
    respawnWatcher()
  }

  const output = renderDashboard(projects, state, gitInfo, { watcherAlive }, portInfo)

  process.stdout.write('\x1B[2J\x1B[H')
  process.stdout.write(output)
}
```

- [ ] **Step 2: Add PORTS section to `src/dashboard/render.js`**

Update function signature:

```js
export function renderDashboard(projects, state, gitInfo, health, portInfo) {
```

After the project table (before the footer), add:

```js
  // Ports section
  lines.push('')
  if (portInfo === null) {
    lines.push(chalk.dim('  PORTS') + chalk.red('  unavailable'))
  } else if (portInfo.length === 0) {
    lines.push(chalk.dim('  PORTS') + chalk.dim('  none'))
  } else {
    lines.push(chalk.dim('  PORTS'))
    for (const port of portInfo) {
      const portStr = chalk.cyan(`:${port.port}`.padEnd(7))
      const nameStr = chalk.dim(port.label.padEnd(10))
      const cmdStr = (port.command || '').padEnd(22)
      const cwdStr = chalk.dim((port.cwd || '').padEnd(28))
      const uptimeStr = chalk.dim(port.uptime || '')
      lines.push(`  ${portStr} ${nameStr} ${cmdStr} ${cwdStr} ${uptimeStr}`)
    }
  }
```

- [ ] **Step 3: Update render test for new `portInfo` parameter**

In `test/dashboard/render.test.js`, update calls to `renderDashboard` to pass a 5th argument:

```js
const output = renderDashboard(projects, state, gitInfo, { watcherAlive: true }, [])
```

```js
const output = renderDashboard([], { version: 1, projects: {} }, {}, { watcherAlive: false }, null)
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/dashboard/index.js src/dashboard/render.js test/dashboard/render.test.js
git commit -m "feat: inline port visibility in dashboard — lsof + categorize"
```

---

### Task 6: Directory Scanner in Dashboard Input

**Files:**
- Modify: `src/dashboard/input.js`

- [ ] **Step 1: Rewrite `src/dashboard/input.js`**

This is a substantial rewrite. The key changes:
- `a` key triggers `handleScanDirectory` (scan flow)
- `A` key triggers `handleManualAdd` (old `a` behavior)
- `d` key triggers `handleChangeScanDir`
- Scanner uses `parseSelection` and `isGitRepo`
- After adding, calls `onInvalidateCache()` callback

Update the `createInputHandler` signature to accept an `onInvalidateCache` callback:

```js
export function createInputHandler(callbacks) {
  const { onRender, onShutdown, onInvalidateCache } = callbacks

  return async function handleKey(key) {
    switch (key) {
      case 'a':
        await handleScanDirectory(onRender, onInvalidateCache)
        break
      case 'A':
        await handleManualAdd(onRender, onInvalidateCache)
        break
      case 'd':
        await handleChangeScanDir(onRender)
        break
      case 'w':
        await handleAddWorker(onRender)
        break
      case 'r':
        await handleRemoveProject(onRender, onInvalidateCache)
        break
      case 's':
        handleSaveNow(onRender)
        break
      case 'q':
        await handleShutdown(onShutdown)
        break
      case '?':
        handleHelp(onRender)
        break
      default:
        break
    }
  }
}
```

Add the scanner handler (new function):

```js
import { readdirSync, lstatSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'
import { parseSelection } from '../selection.js'
import { readConfig, updateConfig, readProjects, addProject } from '../config.js'
import { expandTilde, contractTilde, isGitRepo } from '../paths.js'
import { execFileSync } from 'node:child_process'

async function handleScanDirectory(onRender, onInvalidateCache) {
  if (process.stdin.isRaw) process.stdin.setRawMode(false)

  const config = readConfig()
  let scanDir = config.scan_dir ? expandTilde(config.scan_dir) : null

  const rl = createInterface({ input: process.stdin, output: process.stdout })

  // Prompt for scan_dir if not configured or directory doesn't exist
  if (!scanDir || !existsSync(scanDir)) {
    scanDir = await new Promise((resolve) => {
      const msg = scanDir
        ? `\n  Directory not found: ${contractTilde(scanDir)}\n  Scan directory: `
        : '\n  Scan directory: '
      rl.question(msg, (answer) => {
        const path = answer.trim()
        if (!path) { resolve(null); return }
        resolve(expandTilde(path))
      })
    })

    if (!scanDir || !existsSync(scanDir)) {
      rl.close()
      process.stdin.setRawMode(true)
      if (scanDir) process.stdout.write(chalk.red(`  Directory not found: ${scanDir}\n`))
      onRender()
      return
    }

    updateConfig(undefined, { scan_dir: contractTilde(scanDir) })
  }

  // Scan for git repos
  const registered = readProjects()
  const registeredPaths = new Set(registered.map((p) => resolve(expandTilde(p.path))))

  let repos = []
  let alreadyAddedCount = 0
  try {
    const entries = readdirSync(scanDir)
    for (const entry of entries) {
      const fullPath = join(scanDir, entry)
      const stat = lstatSync(fullPath)
      if (!stat.isDirectory()) continue
      if (stat.isSymbolicLink()) continue

      const resolved = resolve(fullPath)
      if (registeredPaths.has(resolved)) {
        alreadyAddedCount++
        continue
      }

      if (isGitRepo(fullPath)) {
        // Get branch name for display
        let branch = '?'
        try {
          branch = execFileSync('git', ['-C', fullPath, 'rev-parse', '--abbrev-ref', 'HEAD'],
            { encoding: 'utf-8', timeout: 3000 }).trim()
        } catch { /* ok */ }

        repos.push({ name: basename(fullPath), path: fullPath, branch })
      }
    }
  } catch (err) {
    process.stdout.write(chalk.red(`\n  Failed to scan: ${err.message}\n`))
    rl.close()
    process.stdin.setRawMode(true)
    onRender()
    return
  }

  repos.sort((a, b) => a.name.localeCompare(b.name))

  if (repos.length === 0) {
    process.stdout.write(chalk.dim(`\n  No git repos found in ${contractTilde(scanDir)}.\n`))
    if (alreadyAddedCount > 0) {
      process.stdout.write(chalk.dim(`  (${alreadyAddedCount} repos already added)\n`))
    }
    rl.close()
    process.stdin.setRawMode(true)
    setTimeout(onRender, 1000)
    return
  }

  // Display list
  process.stdout.write(chalk.dim(`\n  Scanning ${contractTilde(scanDir)}...\n\n`))
  repos.forEach((repo, i) => {
    process.stdout.write(`  ${String(i + 1).padStart(2)}. ${repo.name.padEnd(22)} ${chalk.dim(repo.branch)}\n`)
  })
  if (alreadyAddedCount > 0) {
    process.stdout.write(chalk.dim(`  (${alreadyAddedCount} repo${alreadyAddedCount === 1 ? '' : 's'} already added, hidden)\n`))
  }
  process.stdout.write('\n')

  // Prompt for selection
  const selection = await new Promise((resolve) => {
    rl.question('  Select (comma-separated, ranges, or * for all)\n  [m] enter path manually\n  : ', (answer) => {
      resolve(answer.trim())
    })
  })

  rl.close()
  process.stdin.setRawMode(true)

  if (selection === 'm') {
    await handleManualAdd(onRender, onInvalidateCache)
    return
  }

  const indices = parseSelection(selection, repos.length)
  if (indices.length === 0) {
    onRender()
    return
  }

  process.stdout.write(chalk.dim(`\n  Adding ${indices.length} project${indices.length === 1 ? '' : 's'}...\n`))

  const config2 = readConfig()
  for (const idx of indices) {
    const repo = repos[idx - 1]
    const alias = repo.name.toLowerCase()
    const added = addProject(undefined, { path: repo.path, workers: config2.default_workers, alias })
    if (added) {
      process.stdout.write(chalk.green(`  ✓ ${alias}\n`))
    }
  }

  if (onInvalidateCache) onInvalidateCache()
  setTimeout(onRender, 1000)
}

async function handleManualAdd(onRender, onInvalidateCache) {
  if (process.stdin.isRaw) process.stdin.setRawMode(false)
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  return new Promise((resolve) => {
    rl.question('\n  Project path: ', (answer) => {
      rl.close()
      process.stdin.setRawMode(true)

      if (answer.trim()) {
        addProjectFromArgs([answer.trim()], {})
        if (onInvalidateCache) onInvalidateCache()
      }

      onRender()
      resolve()
    })
  })
}

async function handleChangeScanDir(onRender) {
  if (process.stdin.isRaw) process.stdin.setRawMode(false)
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  const config = readConfig()
  const current = config.scan_dir ? contractTilde(expandTilde(config.scan_dir)) : '(not set)'

  return new Promise((resolve) => {
    rl.question(`\n  Current scan directory: ${current}\n  New scan directory: `, (answer) => {
      rl.close()
      process.stdin.setRawMode(true)

      if (answer.trim()) {
        const newDir = expandTilde(answer.trim())
        if (existsSync(newDir)) {
          updateConfig(undefined, { scan_dir: contractTilde(newDir) })
          process.stdout.write(chalk.green(`  ✓ Scan directory updated\n`))
        } else {
          process.stdout.write(chalk.red(`  Directory not found: ${answer.trim()}\n`))
        }
      }

      onRender()
      resolve()
    })
  })
}
```

Also add `existsSync` to the imports:

```js
import { writeFileSync, existsSync, readdirSync, lstatSync } from 'node:fs'
```

Update the help text:

```js
function handleHelp(onRender) {
  process.stdout.write(`
${chalk.bold('  Keyboard Shortcuts')}

  ${chalk.bold('a')}  Scan directory — find and add git repos
  ${chalk.bold('A')}  Add path manually — type a project path
  ${chalk.bold('d')}  Change scan directory
  ${chalk.bold('w')}  Add worker — spawns new worker pane in a project
  ${chalk.bold('r')}  Remove project — with confirmation
  ${chalk.bold('s')}  Save state now — triggers immediate save
  ${chalk.bold('q')}  Shutdown — graceful shutdown with confirmation
  ${chalk.bold('?')}  This help screen

  ${chalk.dim('Press any key to return to dashboard...')}
`)
  // ... rest unchanged
}
```

- [ ] **Step 2: Update `src/dashboard/index.js` to pass `onInvalidateCache` to input handler**

```js
const handleKey = createInputHandler({
  onRender: render,
  onShutdown: shutdown,
  onInvalidateCache: () => {
    invalidateGitCache()
    invalidatePortCache()
  },
})
```

Also pass `onInvalidateCache` through `handleRemoveProject` — add it to the remove handler's callback.

- [ ] **Step 3: Update footer in `src/dashboard/render.js`**

Replace the footer lines:

```js
  lines.push(
    chalk.dim('  ') +
    chalk.dim('a') + ' scan  ' +
    chalk.dim('d') + ' scan-dir  ' +
    chalk.dim('w') + ' worker  ' +
    chalk.dim('r') + ' remove  ' +
    chalk.dim('s') + ' save  ' +
    chalk.dim('q') + ' shutdown  ' +
    chalk.dim('?') + ' help'
  )
```

Remove the second footer line (was split across two lines before).

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/dashboard/input.js src/dashboard/index.js src/dashboard/render.js
git commit -m "feat: directory scanner — scan, select, add repos from dashboard"
```

---

### Task 7: First-Run Scanner Integration

**Files:**
- Modify: `src/commands/up.js`

- [ ] **Step 1: Update the first-run experience in `src/commands/up.js`**

Replace the block that handles `projects.length === 0 && !isGitRepo(cwd)` (the else branch around line 93-97):

```js
    } else {
      console.log()
      console.log(chalk.dim('  No projects registered.'))
      console.log()

      // Offer scan or manual entry
      const { createInterface } = await import('node:readline')
      const rl = createInterface({ input: process.stdin, output: process.stdout })

      const choice = await new Promise((resolve) => {
        rl.question(
          '  [1] Scan a directory for git repos\n  [2] Enter a project path manually\n  Select: ',
          (answer) => resolve(answer.trim())
        )
      })

      if (choice === '1') {
        const scanPath = await new Promise((resolve) => {
          rl.question('  Scan directory: ', (answer) => resolve(answer.trim()))
        })
        rl.close()

        if (!scanPath) {
          process.exit(0)
        }

        const fullScanPath = expandTilde(scanPath)
        if (!existsSync(fullScanPath)) {
          console.log(chalk.red(`  Directory not found: ${scanPath}`))
          process.exit(1)
        }

        updateConfig(undefined, { scan_dir: contractTilde(fullScanPath) })

        // Scan and list repos
        const { readdirSync, lstatSync } = await import('node:fs')
        const { join: joinPath, basename: baseName, resolve: resolvePath } = await import('node:path')
        const { execFileSync } = await import('node:child_process')

        const repos = []
        const entries = readdirSync(fullScanPath)
        for (const entry of entries) {
          const fp = joinPath(fullScanPath, entry)
          const stat = lstatSync(fp)
          if (!stat.isDirectory() || stat.isSymbolicLink()) continue
          if (isGitRepo(fp)) {
            let branch = '?'
            try { branch = execFileSync('git', ['-C', fp, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf-8', timeout: 3000 }).trim() } catch {}
            repos.push({ name: baseName(fp), path: resolvePath(fp), branch })
          }
        }

        repos.sort((a, b) => a.name.localeCompare(b.name))

        if (repos.length === 0) {
          console.log(chalk.dim(`  No git repos found in ${scanPath}.`))
          process.exit(0)
        }

        console.log()
        repos.forEach((r, i) => console.log(`  ${i + 1}. ${r.name.padEnd(22)} ${chalk.dim(r.branch)}`))
        console.log()

        const { parseSelection } = await import('../selection.js')
        const rl2 = (await import('node:readline')).createInterface({ input: process.stdin, output: process.stdout })
        const sel = await new Promise((resolve) => {
          rl2.question('  Select (comma-separated, ranges, or * for all): ', (a) => { rl2.close(); resolve(a.trim()) })
        })

        const indices = parseSelection(sel, repos.length)
        if (indices.length === 0) {
          console.log(chalk.dim('  No projects selected.'))
          process.exit(0)
        }

        for (const idx of indices) {
          const repo = repos[idx - 1]
          addProject(undefined, { path: repo.path, workers: config.default_workers, alias: repo.name.toLowerCase() })
          console.log(chalk.green(`  ✓ ${repo.name.toLowerCase()}`))
        }

        projects = readProjects()
      } else if (choice === '2') {
        const path = await new Promise((resolve) => {
          rl.question('  Project path: ', (answer) => { rl.close(); resolve(answer.trim()) })
        })

        if (!path) process.exit(0)

        const fullPath = resolve(expandTilde(path))
        if (!existsSync(fullPath) || !isGitRepo(fullPath)) {
          console.log(chalk.red(`  Not a valid git repo: ${path}`))
          process.exit(1)
        }

        const alias = fullPath.split('/').pop().toLowerCase()
        addProject(undefined, { path: fullPath, workers: config.default_workers, alias })
        console.log(chalk.green(`  ✓ ${alias}`))
        projects = readProjects()
      } else {
        rl.close()
        process.exit(0)
      }

      console.log()
    }
```

Also add `updateConfig` to the imports from config.js:

```js
import { scaffold, readConfig, readProjects, addProject, updateConfig } from '../config.js'
```

And add `existsSync` to the fs import (if not already there).

- [ ] **Step 2: Update portscout window logic**

Change the portscout window creation (around line 159-162) to check `portscout_window` instead of `portscout`:

```js
  // Step 8: Create portscout window (only if legacy mode enabled)
  if (config.portscout_window) {
    tmux('new-window', '-n', 'ports', '-t', SESSION)
    sendKeys(`${SESSION}:ports`, 'portscout watch')
  }
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/commands/up.js
git commit -m "feat: first-run scanner integration and portscout_window config"
```

---

### Task 8: Integration Test + Final Polish

**Files:**
- Modify: `test/integration.test.js`

- [ ] **Step 1: Add scanner and status tests**

Add to the integration test file:

```js
  it('selection parser handles ranges', async () => {
    const { parseSelection } = await import('../src/selection.js')
    assert.deepEqual(parseSelection('1-3,5', 5), [1, 2, 3, 5])
    assert.deepEqual(parseSelection('*', 3), [1, 2, 3])
  })

  it('port lsof parser handles empty input', async () => {
    const { parseLsofOutput } = await import('../src/ports/lsof.js')
    assert.deepEqual(parseLsofOutput(''), [])
  })
```

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add test/integration.test.js
git commit -m "test: integration tests for selection parser and port module"
```

- [ ] **Step 4: Push**

```bash
git push
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Directory scanner with `a` key, numbered list, selection parser
- ✅ `A` key for manual path entry
- ✅ `d` key to change scan_dir
- ✅ `[m]` option in scanner for discoverability
- ✅ Already-added repos hidden with count
- ✅ Non-git directories hidden
- ✅ Selection: numbers, ranges, mixed, `*`
- ✅ Selection parser extracted as own module with tests
- ✅ First-run scan/manual menu
- ✅ `scan_dir` in config, saved on first scan
- ✅ `portscout_window` config field
- ✅ Branch colored yellow when dirty
- ✅ SYNC column: ↑N, ↓N, =, --
- ✅ Git commands in parallel via Promise.all
- ✅ Git data cached at 5s
- ✅ Inline port visibility in dashboard
- ✅ Port data from lsof + categorize (adapted from portscout)
- ✅ Port data cached at 5s
- ✅ Error fallback: "ports unavailable"
- ✅ Cache invalidation on project add/remove
- ✅ lstat for symlink safety
- ✅ Dedup by resolved absolute path
- ✅ Re-render after adding projects
- ✅ Updated footer with all keys

**Placeholder scan:** No TBDs or TODOs. All steps have complete code.

**Type consistency:** `parseSelection(input, max)` signature consistent. `renderDashboard` gains `portInfo` 5th parameter — all call sites updated. `getGitInfo` returns `{ branch, dirty, ahead, behind, lastCommit }` — consistent between collection and rendering. `invalidateGitCache` and `invalidatePortCache` exported and called from `onInvalidateCache`.
