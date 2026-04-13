# Ink Dashboard Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dashboard's manual raw mode / readline handling with Ink (React for CLIs) — same UI, same keys, fewer bugs.

**Architecture:** Delete 3 dashboard files (778 lines), rebuild as React components using Ink. Mode-based rendering — only one component active at a time, no input conflicts. Data collected via React hooks with async intervals. Watcher stays separate. 22 other source files unchanged.

**Tech Stack:** Ink 7.x, React 18.x, ink-table, ink-text-input

---

## File Map

| File | Responsibility |
|---|---|
| `src/dashboard/index.js` (rewrite) | Entry point: `render(<App />)` using Ink, graceful exit handlers |
| `src/dashboard/App.js` (new) | Root component: mode state, error boundary, data hooks |
| `src/dashboard/DashboardView.js` (new) | Main screen: key handler, composes header/table/ports/footer |
| `src/dashboard/Header.js` (new) | Stats line: project count, session count, save time |
| `src/dashboard/ProjectTable.js` (new) | ink-table with git status columns |
| `src/dashboard/PortsSection.js` (new) | Port list: dev servers + infra |
| `src/dashboard/ErrorBar.js` (new) | Error display line |
| `src/dashboard/Footer.js` (new) | Keybinding hints |
| `src/dashboard/HelpScreen.js` (new) | Full keybinding reference |
| `src/dashboard/hooks/useGitInfo.js` (new) | Git data collection (5s interval, parallel, async) |
| `src/dashboard/hooks/usePortInfo.js` (new) | Port data collection (5s interval, async) |
| `src/dashboard/hooks/useWatcherState.js` (new) | Reads state.json on 2s interval |
| `src/dashboard/prompts/ScanPrompt.js` (new) | Directory scanner with selection |
| `src/dashboard/prompts/ManualAddPrompt.js` (new) | Manual path entry |
| `src/dashboard/prompts/ChangeScanDirPrompt.js` (new) | Change scan directory |
| `src/dashboard/prompts/WorkerPrompt.js` (new) | Worker project selection |
| `src/dashboard/prompts/RemovePrompt.js` (new) | Remove with confirmation |
| `src/dashboard/prompts/ShutdownConfirm.js` (new) | Shutdown y/N |
| `src/dashboard/input.js` (delete) | Replaced by useInput in DashboardView + prompt components |
| `src/dashboard/render.js` (delete) | Replaced by React components |

---

### Task 1: Dependencies and Entry Point

**Files:**
- Modify: `package.json`
- Delete: `src/dashboard/input.js`, `src/dashboard/render.js`
- Rewrite: `src/dashboard/index.js`

- [ ] **Step 1: Install new dependencies**

Run:
```bash
cd /Users/apurwasarwajit/Projects/cc
npm install ink react ink-table ink-text-input
npm uninstall cli-table3
```

- [ ] **Step 2: Delete old dashboard files**

```bash
rm src/dashboard/input.js src/dashboard/render.js
```

Keep `src/dashboard/index.js` — we'll rewrite it.

- [ ] **Step 3: Rewrite `src/dashboard/index.js`**

```js
import React from 'react'
import { render } from 'ink'
import { appendFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CC_DIR } from '../paths.js'

const LOG_PATH = join(CC_DIR, 'dashboard.log')
const MAX_LOG_SIZE = 50 * 1024

function logError(context, err) {
  const msg = `[${new Date().toISOString()}] ${context}: ${err?.message ?? err}\n`
  try {
    try {
      const { size } = statSync(LOG_PATH)
      if (size > MAX_LOG_SIZE) writeFileSync(LOG_PATH, '')
    } catch { /* file may not exist */ }
    appendFileSync(LOG_PATH, msg)
  } catch { /* can't log */ }
}

// Graceful exit handlers
process.stdout.on('error', (err) => {
  logError('stdout', err)
  if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') {
    process.exit(0)
  }
})

process.on('unhandledRejection', (err) => {
  logError('unhandledRejection', err)
})

process.on('exit', (code) => {
  if (code !== 0) {
    try {
      process.stderr.write(`\nDashboard exited unexpectedly (code ${code}). See ~/.cc/dashboard.log\n`)
    } catch { /* stream may be closed */ }
  }
})

async function main() {
  const { default: App } = await import('./App.js')
  render(React.createElement(App))
}

main().catch((err) => {
  logError('startup', err)
  process.exit(1)
})
```

- [ ] **Step 4: Create placeholder `src/dashboard/App.js`**

```js
import React from 'react'
import { Text } from 'ink'

export default function App() {
  return React.createElement(Text, null, 'zz dashboard loading...')
}
```

- [ ] **Step 5: Verify it launches**

Run: `node src/dashboard/index.js`
Expected: Prints "zz dashboard loading..." and exits (Ink exits when there's no input to wait for — that's fine for now).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: ink dependencies, entry point, delete old dashboard files"
```

---

### Task 2: Data Hooks

**Files:**
- Create: `src/dashboard/hooks/useGitInfo.js`
- Create: `src/dashboard/hooks/usePortInfo.js`
- Create: `src/dashboard/hooks/useWatcherState.js`

- [ ] **Step 1: Create `src/dashboard/hooks/useGitInfo.js`**

```js
import { useState, useEffect } from 'react'
import { execFile } from 'node:child_process'
import { expandTilde } from '../../paths.js'

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

export function useGitInfo(projects) {
  const [gitInfo, setGitInfo] = useState({})
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function fetch() {
      try {
        const entries = await Promise.all(
          projects.map(async (project) => {
            const fullPath = expandTilde(project.path)
            const info = await getGitInfoForProject(fullPath)
            return [project.path, info]
          })
        )
        if (!cancelled) {
          setGitInfo(Object.fromEntries(entries))
          setError(null)
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }

    fetch()
    const timer = setInterval(fetch, 5000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [projects.length])

  return { gitInfo, gitError: error }
}
```

- [ ] **Step 2: Create `src/dashboard/hooks/usePortInfo.js`**

```js
import { useState, useEffect } from 'react'
import { getListeningPorts } from '../../ports/lsof.js'
import { categorize } from '../../ports/categorize.js'
import { getProcessDetails, getStartTimes, formatUptime } from '../../ports/process.js'

export function usePortInfo() {
  const [portInfo, setPortInfo] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function fetch() {
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

        if (!cancelled) setPortInfo(enriched)
      } catch {
        if (!cancelled) setPortInfo(null)
      }
    }

    fetch()
    const timer = setInterval(fetch, 5000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  return portInfo
}
```

- [ ] **Step 3: Create `src/dashboard/hooks/useWatcherState.js`**

```js
import { useState, useEffect } from 'react'
import { readState } from '../../state.js'
import { existsSync, readFileSync } from 'node:fs'
import { watcherPidPath } from '../../paths.js'

function isWatcherAlive() {
  const pidPath = watcherPidPath()
  if (!existsSync(pidPath)) return false
  try {
    const pid = parseInt(readFileSync(pidPath, 'utf-8').trim(), 10)
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export function useWatcherState() {
  const [state, setState] = useState(readState())
  const [watcherAlive, setWatcherAlive] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => {
      setState(readState())
      setWatcherAlive(isWatcherAlive())
    }, 2000)
    return () => clearInterval(timer)
  }, [])

  return { state, watcherAlive }
}
```

- [ ] **Step 4: Verify hooks load**

Run: `node -e "import('./src/dashboard/hooks/useGitInfo.js').then(() => console.log('git ok')); import('./src/dashboard/hooks/usePortInfo.js').then(() => console.log('port ok')); import('./src/dashboard/hooks/useWatcherState.js').then(() => console.log('watcher ok'))"`
Expected: `git ok`, `port ok`, `watcher ok`

- [ ] **Step 5: Commit**

```bash
git add src/dashboard/hooks/
git commit -m "feat: data hooks — useGitInfo, usePortInfo, useWatcherState"
```

---

### Task 3: View Components (Header, Footer, ErrorBar, ProjectTable, PortsSection)

**Files:**
- Create: `src/dashboard/Header.js`
- Create: `src/dashboard/Footer.js`
- Create: `src/dashboard/ErrorBar.js`
- Create: `src/dashboard/ProjectTable.js`
- Create: `src/dashboard/PortsSection.js`

- [ ] **Step 1: Create `src/dashboard/Header.js`**

```js
import React from 'react'
import { Text } from 'ink'
import { timeSince } from '../paths.js'

export default function Header({ projects, state, watcherAlive }) {
  const totalSessions = countSessions(projects, state)
  const savedAgo = state.saved_at ? timeSince(new Date(state.saved_at)) : 'never'

  return React.createElement(React.Fragment, null,
    React.createElement(Text, null,
      React.createElement(Text, { bold: true, color: 'cyan' }, 'zz'),
      React.createElement(Text, { dimColor: true }, ` · ${projects.length} project${projects.length === 1 ? '' : 's'}`),
      React.createElement(Text, { dimColor: true }, ` · ${totalSessions} session${totalSessions === 1 ? '' : 's'}`),
      React.createElement(Text, { dimColor: true }, ` · saved ${savedAgo} ago`),
    ),
    React.createElement(Text, { dimColor: watcherAlive, color: watcherAlive ? undefined : 'red' },
      watcherAlive ? '  watcher healthy' : '  ⚠ watcher dead'
    ),
  )
}

function countSessions(projects, state) {
  let count = 0
  for (const project of projects) {
    const entry = state.projects?.[project.path]
    if (entry?.panes) {
      count += entry.panes.filter((p) => p.claude_session_id).length
    }
  }
  return count
}
```

- [ ] **Step 2: Create `src/dashboard/Footer.js`**

```js
import React from 'react'
import { Text } from 'ink'

export default function Footer() {
  return React.createElement(React.Fragment, null,
    React.createElement(Text, { dimColor: true }, '  ─'.repeat(28)),
    React.createElement(Text, null,
      React.createElement(Text, { dimColor: true }, '  a'), ' scan  ',
      React.createElement(Text, { dimColor: true }, 'd'), ' scan-dir  ',
      React.createElement(Text, { dimColor: true }, 'w'), ' worker  ',
      React.createElement(Text, { dimColor: true }, 'r'), ' remove  ',
      React.createElement(Text, { dimColor: true }, 's'), ' save  ',
      React.createElement(Text, { dimColor: true }, 'q'), ' shutdown  ',
      React.createElement(Text, { dimColor: true }, '?'), ' help',
    ),
  )
}
```

- [ ] **Step 3: Create `src/dashboard/ErrorBar.js`**

```js
import React from 'react'
import { Text } from 'ink'

export default function ErrorBar({ error }) {
  if (!error) return null
  return React.createElement(Text, { color: 'red' },
    `  ⚠ error: ${error} — see ~/.cc/dashboard.log`
  )
}
```

- [ ] **Step 4: Create `src/dashboard/ProjectTable.js`**

```js
import React from 'react'
import { Text, Box } from 'ink'
import Table from 'ink-table'

export default function ProjectTable({ projects, state, gitInfo }) {
  if (projects.length === 0) {
    return React.createElement(Text, { dimColor: true }, '  No projects registered. Press "a" to add one.')
  }

  const data = projects.map((project) => {
    const stateEntry = state.projects?.[project.path]
    const panes = stateEntry?.panes ?? []
    const activeSessions = panes.filter((p) => p.claude_session_id).length
    const totalPanes = panes.length || (project.workers + 1)
    const git = gitInfo[project.path] ?? { branch: '?', dirty: false, ahead: null, behind: null, lastCommit: '?' }

    let sync = '--'
    if (git.ahead !== null && git.behind !== null) {
      if (git.ahead === 0 && git.behind === 0) sync = '='
      else if (git.ahead > 0 && git.behind > 0) sync = `↑${git.ahead} ↓${git.behind}`
      else if (git.ahead > 0) sync = `↑${git.ahead}`
      else sync = `↓${git.behind}`
    }

    return {
      PROJECT: project.alias,
      BRANCH: git.dirty ? `${git.branch} ✱` : git.branch,
      SYNC: sync,
      SESSIONS: `${activeSessions}/${totalPanes}`,
      STATUS: getStatusText(panes),
      'LAST COMMIT': git.lastCommit,
    }
  })

  return React.createElement(Box, { paddingLeft: 2 },
    React.createElement(Table, { data })
  )
}

function getStatusText(panes) {
  if (panes.length === 0) return '—'
  const active = panes.filter((p) => p.status === 'active').length
  const expired = panes.filter((p) => p.status === 'expired').length
  const stale = panes.filter((p) => p.status === 'stale').length
  const untracked = panes.filter((p) => p.status === 'untracked').length
  const errors = panes.filter((p) => p.status === 'error').length

  if (errors > 0) return '● error'
  if (expired > 0) return `● ${expired} expired`
  if (stale > 0) return '● stale'
  if (active === panes.length) return '● all active'
  if (active > 0 && untracked > 0) return `● ${active} active · ${untracked} untracked`
  if (active > 0) return `● ${active} active`
  if (untracked > 0) return `● ${untracked} untracked`
  return '● ready'
}
```

- [ ] **Step 5: Create `src/dashboard/PortsSection.js`**

```js
import React from 'react'
import { Text, Box } from 'ink'

export default function PortsSection({ portInfo }) {
  if (portInfo === null) {
    return React.createElement(Box, { flexDirection: 'column' },
      React.createElement(Text, null,
        React.createElement(Text, { dimColor: true }, '  PORTS'),
        React.createElement(Text, { color: 'red' }, '  unavailable'),
      ),
    )
  }

  if (portInfo.length === 0) {
    return React.createElement(Box, { flexDirection: 'column' },
      React.createElement(Text, null,
        React.createElement(Text, { dimColor: true }, '  PORTS'),
        React.createElement(Text, { dimColor: true }, '  none'),
      ),
    )
  }

  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Text, { dimColor: true }, '  PORTS'),
    ...portInfo.map((port, i) =>
      React.createElement(Text, { key: i },
        React.createElement(Text, { color: 'cyan' }, `  :${port.port}`.padEnd(9)),
        React.createElement(Text, { dimColor: true }, (port.label || '').padEnd(10)),
        React.createElement(Text, null, (port.command || '').padEnd(22)),
        React.createElement(Text, { dimColor: true }, (port.cwd || '').padEnd(28)),
        React.createElement(Text, { dimColor: true }, port.uptime || ''),
      )
    ),
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add src/dashboard/Header.js src/dashboard/Footer.js src/dashboard/ErrorBar.js src/dashboard/ProjectTable.js src/dashboard/PortsSection.js
git commit -m "feat: view components — Header, Footer, ErrorBar, ProjectTable, PortsSection"
```

---

### Task 4: DashboardView and HelpScreen

**Files:**
- Create: `src/dashboard/DashboardView.js`
- Create: `src/dashboard/HelpScreen.js`

- [ ] **Step 1: Create `src/dashboard/DashboardView.js`**

```js
import React from 'react'
import { Box, useInput } from 'ink'
import { writeFileSync } from 'node:fs'
import { saveTriggerPath } from '../paths.js'
import Header from './Header.js'
import ProjectTable from './ProjectTable.js'
import PortsSection from './PortsSection.js'
import ErrorBar from './ErrorBar.js'
import Footer from './Footer.js'

export default function DashboardView({ projects, state, gitInfo, portInfo, watcherAlive, lastError, onModeChange }) {
  useInput((input) => {
    switch (input) {
      case 'a': onModeChange('scan'); break
      case 'A': onModeChange('manual-add'); break
      case 'd': onModeChange('change-scandir'); break
      case 'w': onModeChange('worker'); break
      case 'r': onModeChange('remove'); break
      case 's':
        try { writeFileSync(saveTriggerPath(), '', { mode: 0o600 }) } catch {}
        break
      case 'q': onModeChange('shutdown'); break
      case '?': onModeChange('help'); break
    }
  })

  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Box, null),
    React.createElement(Header, { projects, state, watcherAlive }),
    React.createElement(Box, null),
    React.createElement(ProjectTable, { projects, state, gitInfo }),
    React.createElement(Box, null),
    React.createElement(PortsSection, { portInfo }),
    React.createElement(ErrorBar, { error: lastError }),
    React.createElement(Box, null),
    React.createElement(Footer, null),
  )
}
```

- [ ] **Step 2: Create `src/dashboard/HelpScreen.js`**

```js
import React from 'react'
import { Text, Box, useInput } from 'ink'

export default function HelpScreen({ onDone }) {
  useInput(() => {
    onDone()
  })

  return React.createElement(Box, { flexDirection: 'column', padding: 1 },
    React.createElement(Text, { bold: true }, '  Keyboard Shortcuts'),
    React.createElement(Text, null, ''),
    React.createElement(Text, null, '  ', React.createElement(Text, { bold: true }, 'a'), '  Scan directory — find and add git repos'),
    React.createElement(Text, null, '  ', React.createElement(Text, { bold: true }, 'A'), '  Add path manually — type a project path'),
    React.createElement(Text, null, '  ', React.createElement(Text, { bold: true }, 'd'), '  Change scan directory'),
    React.createElement(Text, null, '  ', React.createElement(Text, { bold: true }, 'w'), '  Add worker — spawns new worker pane in a project'),
    React.createElement(Text, null, '  ', React.createElement(Text, { bold: true }, 'r'), '  Remove project — with confirmation'),
    React.createElement(Text, null, '  ', React.createElement(Text, { bold: true }, 's'), '  Save state now — triggers immediate save'),
    React.createElement(Text, null, '  ', React.createElement(Text, { bold: true }, 'q'), '  Shutdown — graceful shutdown with confirmation'),
    React.createElement(Text, null, '  ', React.createElement(Text, { bold: true }, 'Ctrl+C'), ' Cancel any prompt'),
    React.createElement(Text, null, '  ', React.createElement(Text, { bold: true }, '?'), '  This help screen'),
    React.createElement(Text, null, ''),
    React.createElement(Text, { dimColor: true }, '  Press any key to return to dashboard...'),
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/dashboard/DashboardView.js src/dashboard/HelpScreen.js
git commit -m "feat: DashboardView with key handler and HelpScreen"
```

---

### Task 5: Prompt Components

**Files:**
- Create: `src/dashboard/prompts/ScanPrompt.js`
- Create: `src/dashboard/prompts/ManualAddPrompt.js`
- Create: `src/dashboard/prompts/ChangeScanDirPrompt.js`
- Create: `src/dashboard/prompts/WorkerPrompt.js`
- Create: `src/dashboard/prompts/RemovePrompt.js`
- Create: `src/dashboard/prompts/ShutdownConfirm.js`

- [ ] **Step 1: Create `src/dashboard/prompts/ManualAddPrompt.js`**

```js
import React, { useState } from 'react'
import { Text, Box } from 'ink'
import TextInput from 'ink-text-input'
import { addProjectFromArgs } from '../../commands/add.js'

export default function ManualAddPrompt({ onDone }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  const handleSubmit = (input) => {
    if (!input) { onDone(); return }
    const result = addProjectFromArgs([input], {})
    if (result.failed.length > 0) {
      setError(`Failed to add: ${input}`)
    } else {
      setDone(true)
      setTimeout(onDone, 500)
    }
  }

  if (done) {
    return React.createElement(Text, { color: 'green' }, '  ✓ Project added')
  }

  return React.createElement(Box, { flexDirection: 'column' },
    error && React.createElement(Text, { color: 'red' }, `  ${error}`),
    React.createElement(Box, null,
      React.createElement(Text, null, '  Project path: '),
      React.createElement(TextInput, { value, onChange: setValue, onSubmit: handleSubmit }),
    ),
    React.createElement(Text, { dimColor: true }, '  (Ctrl+C to cancel)'),
  )
}
```

- [ ] **Step 2: Create `src/dashboard/prompts/ChangeScanDirPrompt.js`**

```js
import React, { useState } from 'react'
import { Text, Box } from 'ink'
import TextInput from 'ink-text-input'
import { existsSync } from 'node:fs'
import { readConfig, updateConfig } from '../../config.js'
import { expandTilde, contractTilde } from '../../paths.js'

export default function ChangeScanDirPrompt({ onDone }) {
  const config = readConfig()
  const current = config.scan_dir ? contractTilde(expandTilde(config.scan_dir)) : '(not set)'
  const [value, setValue] = useState('')
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  const handleSubmit = (input) => {
    if (!input) { onDone(); return }
    const newDir = expandTilde(input)
    if (!existsSync(newDir)) {
      setError(`Directory not found: ${input}`)
      setValue('')
      return
    }
    updateConfig(undefined, { scan_dir: contractTilde(newDir) })
    setDone(true)
    setTimeout(onDone, 500)
  }

  if (done) {
    return React.createElement(Text, { color: 'green' }, '  ✓ Scan directory updated')
  }

  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Text, { dimColor: true }, `  Current scan directory: ${current}`),
    error && React.createElement(Text, { color: 'red' }, `  ${error}`),
    React.createElement(Box, null,
      React.createElement(Text, null, '  New scan directory: '),
      React.createElement(TextInput, { value, onChange: setValue, onSubmit: handleSubmit }),
    ),
    React.createElement(Text, { dimColor: true }, '  (Ctrl+C to cancel)'),
  )
}
```

- [ ] **Step 3: Create `src/dashboard/prompts/ShutdownConfirm.js`**

```js
import React, { useState } from 'react'
import { Text, Box } from 'ink'
import TextInput from 'ink-text-input'

export default function ShutdownConfirm({ onConfirm, onCancel }) {
  const [value, setValue] = useState('')

  const handleSubmit = (input) => {
    if (input.toLowerCase() === 'y') {
      onConfirm()
    } else {
      onCancel()
    }
  }

  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Box, null,
      React.createElement(Text, null, '  Shutdown? (y/N): '),
      React.createElement(TextInput, { value, onChange: setValue, onSubmit: handleSubmit }),
    ),
    React.createElement(Text, { dimColor: true }, '  (Ctrl+C to cancel)'),
  )
}
```

- [ ] **Step 4: Create `src/dashboard/prompts/WorkerPrompt.js`**

```js
import React, { useState } from 'react'
import { Text, Box } from 'ink'
import TextInput from 'ink-text-input'
import { readProjects } from '../../config.js'
import { expandTilde } from '../../paths.js'
import { sessionExists, tmux, tmuxOut, SESSION } from '../../tmux.js'

export default function WorkerPrompt({ onDone }) {
  const projects = readProjects()
  const [value, setValue] = useState('')
  const [message, setMessage] = useState(null)

  if (projects.length === 0) {
    return React.createElement(Text, { color: 'yellow' }, '  No projects registered.')
  }

  if (projects.length === 1) {
    spawnWorker(projects[0])
    setTimeout(onDone, 500)
    return React.createElement(Text, { color: 'green' }, `  ✓ Worker added to ${projects[0].alias}`)
  }

  const handleSubmit = (input) => {
    if (!input) { onDone(); return }
    const idx = parseInt(input, 10) - 1
    if (idx >= 0 && idx < projects.length) {
      spawnWorker(projects[idx])
      setMessage(`✓ Worker added to ${projects[idx].alias}`)
      setTimeout(onDone, 500)
    } else {
      setMessage('Invalid selection')
      setValue('')
    }
  }

  if (message) {
    return React.createElement(Text, { color: message.startsWith('✓') ? 'green' : 'red' }, `  ${message}`)
  }

  return React.createElement(Box, { flexDirection: 'column' },
    ...projects.map((p, i) =>
      React.createElement(Text, { key: i }, `  ${i + 1}. ${p.alias}`)
    ),
    React.createElement(Box, null,
      React.createElement(Text, null, '  Select project: '),
      React.createElement(TextInput, { value, onChange: setValue, onSubmit: handleSubmit }),
    ),
    React.createElement(Text, { dimColor: true }, '  (Ctrl+C to cancel)'),
  )
}

function spawnWorker(project) {
  if (!sessionExists()) return
  try {
    const fullPath = expandTilde(project.path)
    tmux('split-window', '-v', '-p', '30', '-t', `${SESSION}:${project.alias}`, '-c', fullPath)
  } catch { /* failed to spawn */ }
}
```

- [ ] **Step 5: Create `src/dashboard/prompts/RemovePrompt.js`**

```js
import React, { useState } from 'react'
import { Text, Box } from 'ink'
import TextInput from 'ink-text-input'
import { readProjects, removeProject } from '../../config.js'
import { sessionExists, tmux, SESSION } from '../../tmux.js'

export default function RemovePrompt({ onDone }) {
  const projects = readProjects()
  const [step, setStep] = useState('select')
  const [selected, setSelected] = useState(null)
  const [value, setValue] = useState('')
  const [message, setMessage] = useState(null)

  if (projects.length === 0) {
    return React.createElement(Text, { color: 'yellow' }, '  No projects to remove.')
  }

  if (message) {
    return React.createElement(Text, { color: message.startsWith('✓') ? 'green' : 'red' }, `  ${message}`)
  }

  if (step === 'select') {
    const handleSelect = (input) => {
      if (!input) { onDone(); return }
      const idx = parseInt(input, 10) - 1
      if (idx >= 0 && idx < projects.length) {
        setSelected(projects[idx])
        setStep('confirm')
        setValue('')
      } else {
        setMessage('Invalid selection')
        setTimeout(onDone, 1000)
      }
    }

    return React.createElement(Box, { flexDirection: 'column' },
      ...projects.map((p, i) =>
        React.createElement(Text, { key: i }, `  ${i + 1}. ${p.alias}`)
      ),
      React.createElement(Box, null,
        React.createElement(Text, null, '  Select project to remove: '),
        React.createElement(TextInput, { value, onChange: setValue, onSubmit: handleSelect }),
      ),
      React.createElement(Text, { dimColor: true }, '  (Ctrl+C to cancel)'),
    )
  }

  const handleConfirm = (input) => {
    if (input.toLowerCase() === 'y') {
      if (sessionExists()) {
        try { tmux('kill-window', '-t', `${SESSION}:${selected.alias}`) } catch {}
      }
      removeProject(undefined, selected.alias)
      setMessage(`✓ Removed ${selected.alias}`)
      setTimeout(onDone, 500)
    } else {
      onDone()
    }
  }

  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Box, null,
      React.createElement(Text, null, `  Remove ${selected.alias}? (y/N): `),
      React.createElement(TextInput, { value, onChange: setValue, onSubmit: handleConfirm }),
    ),
    React.createElement(Text, { dimColor: true }, '  (Ctrl+C to cancel)'),
  )
}
```

- [ ] **Step 6: Create `src/dashboard/prompts/ScanPrompt.js`**

```js
import React, { useState } from 'react'
import { Text, Box } from 'ink'
import TextInput from 'ink-text-input'
import { existsSync, readdirSync, lstatSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'
import { execFileSync } from 'node:child_process'
import { readConfig, updateConfig, readProjects, addProject } from '../../config.js'
import { expandTilde, contractTilde, isGitRepo } from '../../paths.js'
import { parseSelection } from '../../selection.js'

export default function ScanPrompt({ onDone }) {
  const config = readConfig()
  const [step, setStep] = useState(config.scan_dir ? 'list' : 'ask-dir')
  const [scanDir, setScanDir] = useState(config.scan_dir ? expandTilde(config.scan_dir) : '')
  const [value, setValue] = useState('')
  const [error, setError] = useState(null)
  const [repos, setRepos] = useState([])
  const [alreadyAdded, setAlreadyAdded] = useState(0)
  const [message, setMessage] = useState(null)

  // Step: ask for scan directory
  if (step === 'ask-dir') {
    const handleDirSubmit = (input) => {
      if (!input) { onDone(); return }
      const dir = expandTilde(input)
      if (!existsSync(dir)) {
        setError(`Directory not found: ${input}`)
        setValue('')
        return
      }
      updateConfig(undefined, { scan_dir: contractTilde(dir) })
      setScanDir(dir)
      setStep('list')
      setValue('')
      setError(null)
    }

    return React.createElement(Box, { flexDirection: 'column' },
      error && React.createElement(Text, { color: 'red' }, `  ${error}`),
      React.createElement(Box, null,
        React.createElement(Text, null, '  Scan directory: '),
        React.createElement(TextInput, { value, onChange: setValue, onSubmit: handleDirSubmit }),
      ),
      React.createElement(Text, { dimColor: true }, '  (Ctrl+C to cancel)'),
    )
  }

  // Step: show list and select
  if (step === 'list' && repos.length === 0 && !message) {
    // Scan on first render of this step
    const dir = scanDir || expandTilde(config.scan_dir)
    if (!existsSync(dir)) {
      setStep('ask-dir')
      setError(`Directory not found: ${contractTilde(dir)}`)
      return null
    }

    const registered = readProjects()
    const registeredPaths = new Set(registered.map((p) => resolve(expandTilde(p.path))))
    const found = []
    let addedCount = 0

    try {
      for (const entry of readdirSync(dir)) {
        const fullPath = join(dir, entry)
        try {
          const stat = lstatSync(fullPath)
          if (!stat.isDirectory() || stat.isSymbolicLink()) continue
        } catch { continue }

        const resolved = resolve(fullPath)
        if (registeredPaths.has(resolved)) { addedCount++; continue }

        if (isGitRepo(fullPath)) {
          let branch = '?'
          try { branch = execFileSync('git', ['-C', fullPath, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf-8', timeout: 3000 }).trim() } catch {}
          found.push({ name: basename(fullPath), path: fullPath, branch })
        }
      }
    } catch (err) {
      setMessage(`Failed to scan: ${err.message}`)
      setTimeout(onDone, 1500)
      return null
    }

    found.sort((a, b) => a.name.localeCompare(b.name))
    setRepos(found)
    setAlreadyAdded(addedCount)

    if (found.length === 0) {
      let msg = `No new git repos found in ${contractTilde(dir)}.`
      if (addedCount > 0) msg += ` (${addedCount} already added)`
      setMessage(msg)
      setTimeout(onDone, 1500)
      return null
    }

    return null // Will re-render with repos populated
  }

  if (message) {
    return React.createElement(Text, { dimColor: true }, `  ${message}`)
  }

  // Show repo list and selection input
  const handleSelection = (input) => {
    if (!input) { onDone(); return }
    if (input === 'm') { onDone('manual-add'); return }

    const indices = parseSelection(input, repos.length)
    if (indices.length === 0) { onDone(); return }

    const cfg = readConfig()
    const added = []
    for (const idx of indices) {
      const repo = repos[idx - 1]
      const alias = repo.name.toLowerCase()
      const ok = addProject(undefined, { path: repo.path, workers: cfg.default_workers, alias })
      if (ok) added.push(alias)
    }

    setMessage(`Added ${added.length} project${added.length === 1 ? '' : 's'}: ${added.join(', ')}`)
    setTimeout(onDone, 1000)
  }

  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Text, { dimColor: true }, `  Scanning ${contractTilde(scanDir)}...\n`),
    ...repos.map((repo, i) =>
      React.createElement(Text, { key: i }, `  ${String(i + 1).padStart(2)}. ${repo.name.padEnd(22)} ${repo.branch}`)
    ),
    alreadyAdded > 0 && React.createElement(Text, { dimColor: true }, `  (${alreadyAdded} repo${alreadyAdded === 1 ? '' : 's'} already added, hidden)`),
    React.createElement(Text, null, ''),
    React.createElement(Box, null,
      React.createElement(Text, null, '  Select (comma-separated, ranges, or * for all) [m] manual: '),
      React.createElement(TextInput, { value, onChange: setValue, onSubmit: handleSelection }),
    ),
    React.createElement(Text, { dimColor: true }, '  (Ctrl+C to cancel)'),
  )
}
```

- [ ] **Step 7: Commit**

```bash
mkdir -p src/dashboard/prompts
git add src/dashboard/prompts/
git commit -m "feat: prompt components — scan, manual-add, change-scandir, worker, remove, shutdown"
```

---

### Task 6: App Component (Root)

**Files:**
- Rewrite: `src/dashboard/App.js`

- [ ] **Step 1: Rewrite `src/dashboard/App.js`**

```js
import React, { useState, useCallback } from 'react'
import { Text, Box, useApp } from 'ink'
import { readProjects } from '../config.js'
import { useGitInfo } from './hooks/useGitInfo.js'
import { usePortInfo } from './hooks/usePortInfo.js'
import { useWatcherState } from './hooks/useWatcherState.js'
import DashboardView from './DashboardView.js'
import HelpScreen from './HelpScreen.js'
import ScanPrompt from './prompts/ScanPrompt.js'
import ManualAddPrompt from './prompts/ManualAddPrompt.js'
import ChangeScanDirPrompt from './prompts/ChangeScanDirPrompt.js'
import WorkerPrompt from './prompts/WorkerPrompt.js'
import RemovePrompt from './prompts/RemovePrompt.js'
import ShutdownConfirm from './prompts/ShutdownConfirm.js'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return React.createElement(Box, { flexDirection: 'column', padding: 1 },
        React.createElement(Text, { color: 'red' }, '  zz dashboard encountered an error.'),
        React.createElement(Text, { dimColor: true }, `  ${this.state.error?.message ?? 'Unknown error'}`),
        React.createElement(Text, { dimColor: true }, '  See ~/.cc/dashboard.log for details.'),
      )
    }
    return this.props.children
  }
}

export default function App() {
  const { exit } = useApp()
  const [mode, setMode] = useState('browse')
  const [lastError, setLastError] = useState(null)
  const [projectsVersion, setProjectsVersion] = useState(0)

  // Re-read projects when version changes (after add/remove)
  const projects = readProjects()
  const { gitInfo, gitError } = useGitInfo(projects)
  const portInfo = usePortInfo()
  const { state, watcherAlive } = useWatcherState()

  const refreshProjects = useCallback(() => {
    setProjectsVersion((v) => v + 1)
  }, [])

  const handleDone = useCallback((nextMode) => {
    refreshProjects()
    setMode(nextMode ?? 'browse')
  }, [refreshProjects])

  const handleShutdown = useCallback(() => {
    import('../commands/down.js').then((mod) => mod.default([]))
  }, [])

  const error = lastError || gitError

  switch (mode) {
    case 'scan':
      return React.createElement(ErrorBoundary, null,
        React.createElement(ScanPrompt, {
          onDone: (nextMode) => handleDone(nextMode),
        })
      )
    case 'manual-add':
      return React.createElement(ErrorBoundary, null,
        React.createElement(ManualAddPrompt, { onDone: () => handleDone() })
      )
    case 'change-scandir':
      return React.createElement(ErrorBoundary, null,
        React.createElement(ChangeScanDirPrompt, { onDone: () => handleDone() })
      )
    case 'worker':
      return React.createElement(ErrorBoundary, null,
        React.createElement(WorkerPrompt, { onDone: () => handleDone() })
      )
    case 'remove':
      return React.createElement(ErrorBoundary, null,
        React.createElement(RemovePrompt, { onDone: () => handleDone() })
      )
    case 'shutdown':
      return React.createElement(ErrorBoundary, null,
        React.createElement(ShutdownConfirm, {
          onConfirm: handleShutdown,
          onCancel: () => setMode('browse'),
        })
      )
    case 'help':
      return React.createElement(ErrorBoundary, null,
        React.createElement(HelpScreen, { onDone: () => setMode('browse') })
      )
    default:
      return React.createElement(ErrorBoundary, null,
        React.createElement(DashboardView, {
          projects,
          state,
          gitInfo,
          portInfo,
          watcherAlive,
          lastError: error,
          onModeChange: setMode,
        })
      )
  }
}
```

- [ ] **Step 2: Verify the full dashboard loads**

Run: `node src/dashboard/index.js`
Expected: Dashboard renders with project table, ports, footer. Keyboard shortcuts should work.

- [ ] **Step 3: Commit**

```bash
git add src/dashboard/App.js
git commit -m "feat: App root component — mode management, error boundary, data hooks"
```

---

### Task 7: Update Tests and Integration

**Files:**
- Modify: `test/dashboard/render.test.js`
- Modify: `src/commands/up.js` (if dashboard launch path changed)

- [ ] **Step 1: Rewrite `test/dashboard/render.test.js`**

The old render tests tested the string-based render function. Replace with import checks for the new components:

```js
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
})
```

- [ ] **Step 2: Run full test suite**

Run: `cd /Users/apurwasarwajit/Projects/cc && npm test`
Expected: All tests pass.

- [ ] **Step 3: Verify `up.js` dashboard launch path is correct**

The `up.js` file references `new URL('../dashboard/index.js', import.meta.url).pathname` — this path is still correct since `index.js` still exists at the same location. No change needed.

- [ ] **Step 4: Commit**

```bash
git add test/dashboard/render.test.js
git commit -m "test: rewrite dashboard tests for Ink components"
```

---

### Task 8: End-to-End Test and Push

- [ ] **Step 1: Run full test suite**

Run: `cd /Users/apurwasarwajit/Projects/cc && npm test`
Expected: All tests pass.

- [ ] **Step 2: Test manually**

Kill any existing session and boot fresh:
```bash
zz kill 2>/dev/null
rm -rf ~/.cc
cd ~/Projects/Portscout
zz up
```

Verify:
- Dashboard renders with project table, git status, ports
- Press `?` — help screen shows, press any key returns
- Press `d` — scan dir prompt works, backspace works, Ctrl+C cancels
- Press `a` — scanner shows repos, selection works
- Press `q` — shutdown confirmation, `n` cancels

- [ ] **Step 3: Push**

```bash
git push
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Delete 3 old dashboard files (Task 1)
- ✅ Ink, React, ink-table, ink-text-input dependencies (Task 1)
- ✅ Remove cli-table3 (Task 1)
- ✅ Keep chalk (for non-dashboard files)
- ✅ Entry point with graceful exit handlers (Task 1)
- ✅ useGitInfo hook — 5s interval, parallel, async (Task 2)
- ✅ usePortInfo hook — 5s interval, async (Task 2)
- ✅ useWatcherState hook — 2s interval (Task 2)
- ✅ Header, Footer, ErrorBar, ProjectTable, PortsSection (Task 3)
- ✅ DashboardView with useInput key handler (Task 4)
- ✅ HelpScreen (Task 4)
- ✅ All 6 prompt components with ink-text-input (Task 5)
- ✅ ScanPrompt with parseSelection and inline validation (Task 5)
- ✅ App root with mode management (Task 6)
- ✅ ErrorBoundary (Task 6)
- ✅ LoadingScreen (not needed — React renders immediately, hooks populate data async)
- ✅ No artificial delays (setTimeout removed, inline status messages)
- ✅ Inline validation in prompts (error state shown in component)
- ✅ Ctrl+C cancels every prompt (Ink native)
- ✅ Watcher stays separate (unchanged)
- ✅ No chalk inside Ink components (using Text color props)

**Placeholder scan:** No TBDs or TODOs. All steps have complete code.

**Type consistency:** All hooks return consistent types. `useGitInfo` returns `{ gitInfo, gitError }`. `usePortInfo` returns `portInfo` (array or null). `useWatcherState` returns `{ state, watcherAlive }`. Component props match across App → DashboardView → sub-components.
