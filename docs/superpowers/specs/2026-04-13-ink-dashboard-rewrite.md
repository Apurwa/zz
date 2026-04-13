# Dashboard Ink Rewrite

**Date:** 2026-04-13
**Status:** Approved
**Author:** Apurwa

## Overview

Replace the dashboard's manual raw mode / readline input handling with Ink (React for CLIs). This is a reliability rewrite — same UI, same keys, same layout, fewer bugs. The 3 dashboard files are deleted and rebuilt as React components. The remaining 22 source files (commands, watcher, ports, config, state, tmux, selection) are unchanged.

## Problem

The current dashboard uses manual `process.stdin.setRawMode` toggling and `readline.createInterface` for prompts. This has caused:
- Broken backspace (readline and raw handler fighting over input)
- Duplicate prompts (re-entrant key handlers)
- Phantom keystrokes (stacking data listeners)
- Silent crashes (unhandled rejections in async setInterval render)
- Escape handler killing readline on arrow keys

Every fix introduced new edge cases. The raw mode / readline architecture is fundamentally flawed for a TUI with mixed input modes.

## Solution

Rewrite with Ink. Ink manages raw mode internally, provides `useInput` for single-key shortcuts and `ink-text-input` for prompts. No manual mode toggling. No readline. React's component lifecycle handles input focus naturally.

---

## Dependency Changes

**Add:**
- `ink` — React renderer for CLIs
- `react` — peer dependency of Ink
- `ink-table` — table component (replaces cli-table3)
- `ink-text-input` — text input component (replaces readline)

**Remove:**
- `cli-table3` — replaced by ink-table

**Keep (used outside dashboard):**
- `chalk` — still used by commands, watcher, help. NOT used inside Ink components (Ink uses `<Text color="...">` instead).

---

## Component Architecture

```
<App>                              # Root — manages mode state, error boundary
  ├── <ErrorBoundary>              # Catches render errors, shows fallback
  │   ├── <DashboardView>          # mode: 'browse' — the main screen
  │   │   ├── <Header />           # "zz · 3 projects · 2 sessions · saved 12s ago"
  │   │   ├── <ProjectTable />     # ink-table: PROJECT, BRANCH, SYNC, SESSIONS, STATUS, LAST COMMIT
  │   │   ├── <PortsSection />     # PORTS: dev servers + infra
  │   │   ├── <ErrorBar />         # Shows last error if any (red text)
  │   │   └── <Footer />           # "a scan  d scan-dir  w worker  r remove  s save  q shutdown  ? help"
  │   │
  │   ├── <ScanPrompt />           # mode: 'scan'
  │   ├── <ManualAddPrompt />      # mode: 'manual-add'
  │   ├── <ChangeScanDirPrompt />  # mode: 'change-scandir'
  │   ├── <WorkerPrompt />         # mode: 'worker'
  │   ├── <RemovePrompt />         # mode: 'remove'
  │   ├── <ShutdownConfirm />      # mode: 'shutdown'
  │   └── <HelpScreen />           # mode: 'help'
  │
  └── <LoadingScreen />            # Shown on first render before data is ready
```

### Mode Management

`App` holds a `mode` state. Only one mode renders at a time:

```js
function App() {
  const [mode, setMode] = useState('loading')
  // ... data hooks ...

  if (mode === 'loading') return <LoadingScreen />
  if (mode === 'scan') return <ScanPrompt onDone={() => setMode('browse')} />
  if (mode === 'shutdown') return <ShutdownConfirm onConfirm={...} onCancel={() => setMode('browse')} />
  // ... other modes ...
  return <DashboardView onModeChange={setMode} />
}
```

No input conflicts — only the active component receives input via `useInput`.

### Key Handler

`DashboardView` uses `useInput` to map keys to mode transitions:

```js
function DashboardView({ onModeChange, ...data }) {
  useInput((input, key) => {
    if (input === 'a') onModeChange('scan')
    if (input === 'A') onModeChange('manual-add')
    if (input === 'd') onModeChange('change-scandir')
    if (input === 'w') onModeChange('worker')
    if (input === 'r') onModeChange('remove')
    if (input === 's') handleSave()
    if (input === 'q') onModeChange('shutdown')
    if (input === '?') onModeChange('help')
  })

  return (
    <>
      <Header ... />
      <ProjectTable ... />
      <PortsSection ... />
      <ErrorBar ... />
      <Footer />
    </>
  )
}
```

### Prompt Components

Each prompt uses `ink-text-input`. Example:

```js
function ScanPrompt({ onDone }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(null)

  const handleSubmit = (input) => {
    if (!input) { onDone(); return }
    // validate, scan, add projects...
    onDone()
  }

  return (
    <Box flexDirection="column">
      {error && <Text color="red">  {error}</Text>}
      <Box>
        <Text>  Scan directory: </Text>
        <TextInput value={value} onChange={setValue} onSubmit={handleSubmit} />
      </Box>
      <Text dimColor>  (Ctrl+C to cancel)</Text>
    </Box>
  )
}
```

Ctrl+C is handled by Ink natively — no custom handlers needed.

---

## Data Flow

### Git Info (5-second interval)

```js
function useGitInfo(projects) {
  const [gitInfo, setGitInfo] = useState({})

  useEffect(() => {
    let cancelled = false
    async function fetch() {
      const info = await getGitInfoParallel(projects)
      if (!cancelled) setGitInfo(info)
    }
    fetch()
    const timer = setInterval(fetch, 5000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [projects])

  return gitInfo
}
```

Git commands run in parallel per project using `execFile` (async, non-blocking). No sync exec — Ink's render loop is never blocked.

### Port Info (5-second interval)

Same pattern as git info. Calls `getListeningPorts()` + `categorize()` + `getProcessDetails()` + `getStartTimes()`. All async.

### State (read from watcher)

The watcher remains a separate process in a hidden tmux pane. The dashboard reads `state.json` on a 2-second interval:

```js
function useWatcherState() {
  const [state, setState] = useState(readState())

  useEffect(() => {
    const timer = setInterval(() => {
      setState(readState())
    }, 2000)
    return () => clearInterval(timer)
  }, [])

  return state
}
```

No watcher merge. Dashboard reads, watcher writes. Independent processes.

### Cache Invalidation

When a prompt adds or removes a project, it calls the invalidation callbacks directly (git and port data refetch on next interval). React state update triggers re-render automatically.

---

## Error Handling

### React Error Boundary

Wraps the entire app. On render error, shows:
```
  zz dashboard encountered an error.
  See ~/.cc/dashboard.log for details.
  Press any key to retry...
```

Logs error to `~/.cc/dashboard.log` (capped at 50KB).

### Data Fetch Errors

Each `useEffect` has try/catch. On failure:
- Git info: show `?` for all fields, set `lastError`
- Port info: show "ports unavailable"
- State read: use empty state, don't crash

`<ErrorBar />` shows the last error in the dashboard footer when `lastError` is set.

### Graceful Exit

```js
process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') {
    process.exit(0)
  }
})

process.on('exit', (code) => {
  if (code !== 0) {
    process.stderr.write(`\nDashboard exited unexpectedly (code ${code}). See ~/.cc/dashboard.log\n`)
  }
})
```

---

## Prompt UX Improvements

Since we're rewriting all prompts, apply three CPO-recommended improvements:

1. **No artificial delays.** Remove all `setTimeout(res, 500)` and `setTimeout(res, 1000)`. Status messages appear inline and clear on next render.

2. **Inline validation.** Invalid input shows an error in the prompt component:
   ```
     Scan directory: /nonexistent
     Directory not found. Try again:
   ```
   Instead of silently returning to dashboard.

3. **Consistent cancel.** Ctrl+C cancels every prompt and returns to dashboard. Ink handles this natively.

---

## Files Changed

### Deleted
- `src/dashboard/index.js` (273 lines)
- `src/dashboard/input.js` (357 lines)
- `src/dashboard/render.js` (148 lines)

### Created
- `src/dashboard/App.js` — Root component, mode management, error boundary, data hooks
- `src/dashboard/DashboardView.js` — Main screen: header, table, ports, footer, key handler
- `src/dashboard/ProjectTable.js` — ink-table wrapper with git status columns
- `src/dashboard/PortsSection.js` — Port list rendering
- `src/dashboard/Header.js` — Stats line
- `src/dashboard/Footer.js` — Keybinding hints
- `src/dashboard/ErrorBar.js` — Error display
- `src/dashboard/prompts/ScanPrompt.js` — Directory scanner with selection
- `src/dashboard/prompts/ManualAddPrompt.js` — Manual path entry
- `src/dashboard/prompts/ChangeScanDirPrompt.js` — Change scan directory
- `src/dashboard/prompts/WorkerPrompt.js` — Worker project selection
- `src/dashboard/prompts/RemovePrompt.js` — Remove with confirmation
- `src/dashboard/prompts/ShutdownConfirm.js` — Shutdown y/N
- `src/dashboard/HelpScreen.js` — Keybinding reference
- `src/dashboard/hooks/useGitInfo.js` — Git data collection hook
- `src/dashboard/hooks/usePortInfo.js` — Port data collection hook
- `src/dashboard/hooks/useWatcherState.js` — State.json reader hook
- `src/dashboard/index.js` — Entry point: `render(<App />)` using Ink

### Modified
- `package.json` — Add ink, react, ink-table, ink-text-input. Remove cli-table3, chalk.
- `src/commands/up.js` — Update dashboard launch command (still `node <path>`)
- `test/dashboard/render.test.js` — Rewrite for new component structure

### Unchanged (22 files)
All commands, watcher, ports, config, state, tmux, selection modules.

---

## Watcher Interaction

**No changes to watcher.** It stays as a separate process in a hidden tmux pane.

- Watcher writes `state.json` every 2s (event) / 30s (heartbeat)
- Dashboard reads `state.json` every 2s via `useWatcherState` hook
- Watcher writes `watcher.pid` — dashboard checks it for health display
- `save-trigger` file mechanism unchanged (dashboard writes trigger, watcher reads it)

The `up.js` boot sequence still creates the watcher pane exactly as before.

---

## Scope

This is a dashboard-only rewrite. Same UI, same keys, same data. The architectural change is: React components replace manual stdin/readline management.

Out of scope: new features, command changes, watcher changes, config changes.
