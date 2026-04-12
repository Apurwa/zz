# Dashboard Improvements: Scanner, Git Status, Ports

**Date:** 2026-04-12
**Status:** Approved
**Author:** Apurwa

## Overview

Three enhancements to the `zz` dashboard: (1) a directory scanner for adding projects without typing paths, (2) enriched git status indicators, and (3) inline port visibility replacing the separate portscout window.

---

## Feature 1: Directory Scanner

### Behavior

**`a` key — scan directory:**

1. If `scan_dir` is not configured in `~/.cc/config.json`, prompt: `Scan directory: _`
2. Validate the path exists. If not, print `Directory not found` and re-prompt.
3. Save the entered value as `scan_dir` in config for future reuse.
4. Scan `scan_dir` for immediate subdirectories that are git repos (use `lstat` to avoid following symlinks).
5. Deduplicate by resolved absolute path against already-registered projects.
6. Display a numbered list:

```
  Scanning ~/Projects...

  1. api                  main ↑2
  2. frontend             dev
  3. infra                main
  4. mobile-app           main ↑1 ↓3
  (3 repos already added, hidden)

  Select (comma-separated, ranges, or * for all)
  [m] enter path manually
  : 1-3
  Adding 3 projects...
  ✓ api
  ✓ frontend
  ✓ infra
```

**List ordering:**
- Selectable git repos only, sorted alphabetically
- Already-added projects hidden with a count line: `(N repos already added, hidden)`
- Non-git directories not shown

**Selection format:**
- Single numbers: `1`
- Comma-separated: `1,3,5`
- Ranges: `1-4`
- Mixed: `1-3,5,8`
- All: `*` (adds all selectable git repos)
- `m`: switch to manual path entry
- Empty/Ctrl-C: cancel, return to dashboard

The selection parser is extracted as a pure function `parseSelection(input, max)` in its own module (`src/selection.js`) with unit tests covering: single, comma, range, mixed, `*`, out-of-bounds, reversed ranges (5-2), and garbage input.

**Error handling:**
- If `scan_dir` is configured but the directory no longer exists, print `Directory not found: <path>` and re-prompt for a new path. Update `scan_dir` in config.
- If `scan_dir` contains zero git repos, print `No git repos found in <path>.` and return to dashboard.
- Out-of-bounds numbers in selection are silently skipped.

**After selection:**
- Print confirmation: `Adding N projects...`
- Print each added project with green checkmark
- Create tmux windows for each new project immediately
- Re-render dashboard (immediate, not waiting for next 2s cycle)
- Return to dashboard

**`d` key — change scan directory:**
- Prompts for new path, validates, updates `scan_dir` in config.
- Next `a` press uses the new path.

**`A` key (shift-A) — manual path entry:**
- Same as current behavior: prompt for a path, validate, add.
- Also shown as `[m]` option within the scanner list for discoverability.

### First-Run Integration

When `zz up` runs with zero projects registered and cwd is NOT a git repo:

Current behavior: prints "No projects registered" and exits.

New behavior:
```
  No projects registered.

  [1] Scan a directory for git repos
  [2] Enter a project path manually
  Select: _
```

Option 1: prompts for scan directory, runs scanner, user selects projects. Saves `scan_dir` to config.
Option 2: prompts for a single path, adds it.

Boot continues after at least one project is added. If user cancels (Ctrl-C), exit.

### Config Change

`~/.cc/config.json` gains an optional field:

```json
{
  "default_workers": 2,
  "auto_save_interval": 30,
  "portscout_window": false,
  "scan_dir": null
}
```

`scan_dir` is `null` by default. Set automatically on first scan.

`portscout_window`: `false` (default) = ports shown inline in dashboard. `true` = legacy separate tmux window running `portscout watch`.

---

## Feature 2: Enhanced Git Status

### Dashboard Table Changes

Current columns: `PROJECT | BRANCH | SESSIONS | STATUS | LAST COMMIT`

New columns: `PROJECT | BRANCH | SYNC | SESSIONS | STATUS | LAST COMMIT`

**BRANCH column:**
- Entire branch text is colored yellow when there are uncommitted changes (dirty working tree)
- Clean branches remain default color
- Example: `main` (white, clean) vs `main` (yellow, dirty)

**SYNC column (new):**
- `↑N` — commits ahead of remote
- `↓N` — commits behind remote
- `↑N ↓M` — both ahead and behind
- `=` — in sync with remote
- `--` — no remote tracking branch, detached HEAD, or orphan branch

### Git Data Collection

The `getGitInfo` function in `src/dashboard/index.js` is extended to collect:

1. **Branch name:** `git rev-parse --abbrev-ref HEAD` (existing)
2. **Dirty state:** `git status --porcelain` — if output is non-empty, working tree is dirty
3. **Ahead/behind:** `git rev-list --left-right --count HEAD...@{upstream}` — returns `ahead\tbehind`. On failure (detached HEAD, no upstream), returns `{ ahead: null, behind: null }`.
4. **Last commit:** `git log -1 --format=%cr` (existing)

**Performance:** Git commands for all projects run in parallel via `Promise.all`. The render interval remains 2 seconds but git data is cached and only refreshed every 5 seconds to avoid thrashing on large repos.

The returned `gitInfo` object changes from:
```js
{ branch: 'main', lastCommit: '2h ago' }
```
to:
```js
{ branch: 'main', dirty: true, ahead: 2, behind: 0, lastCommit: '2h ago' }
```

---

## Feature 3: Inline Port Visibility

### Change

Remove the separate `ports` tmux window. Instead, render port information directly in the dashboard TUI below the project table.

### Dashboard Layout

```
zz · 3 projects · 2 sessions · saved 12s ago

PROJECT     BRANCH        SYNC    SESSIONS   STATUS       LAST COMMIT
portscout   main          ↑2      1/3        ● active     2h ago
api         dev           ↑1 ↓3   0/3        ● ready      45m ago

PORTS
:3100  node   next dev             ~/Projects/portscout    2h 14m
:8080  node   node server.js       ~/Projects/api          4h 01m
:5432  Postgres                                            8h 30m

────────────────────────────────────────────────────
a scan  d scan-dir  w worker  r remove  s save  q shutdown  ? help
```

### Port Data Collection

Inline the core logic from portscout's `lsof.js` and `categorize.js` into new files:

- `src/ports/lsof.js` — `getListeningPorts()`: runs `lsof -i -P -n -sTCP:LISTEN +c0`, parses output into `{ name, pid, port, host }` entries
- `src/ports/categorize.js` — `categorize(entries)`: sorts into `{ dev, infra, system }` buckets

These are copied from the portscout project (`~/Projects/Portscout/src/lsof.js` and `categorize.js`) and adapted to work as pure modules without portscout's display logic.

### Render Changes

In `src/dashboard/render.js`:
- After the project table, render a `PORTS` section
- Show dev servers and infrastructure by default
- System ports hidden (same as portscout's default)
- Each line shows: port, process name, command, cwd (if available), uptime
- Port data is collected by `src/dashboard/index.js` on each render cycle via `getListeningPorts()` + `categorize()`

### Config Change

The `portscout_window` config field controls port display:
- `false` (default): ports shown inline in dashboard, no separate window
- `true`: legacy behavior — creates a separate `ports` window running `portscout watch`

### Process Details

Port entries need command and cwd info for the display. The `src/ports/` module includes a lightweight version of portscout's `ps.js` to get:
- Command: `ps -o args= -p <pid>` → formatted to meaningful part (e.g., "next dev")
- CWD: `lsof -p <pid> -a -d cwd -Fn` → formatted with tilde contraction
- Uptime: `ps -o lstart= -p <pid>` → formatted as "Xh Ym"

**Performance:** Port data is collected every 5 seconds (not every 2s render cycle) and cached. The `lsof` call is a single process spawn that returns all ports at once, so this is efficient.

**Error handling:** If `lsof` fails (permissions, sandbox, missing binary), show `ports unavailable` in the PORTS section instead of crashing or leaving it blank. Same graceful fallback for git commands on corrupted repos.

**Cache invalidation:** Both git and port caches are invalidated immediately when projects are added or removed (not just on the 5s timer).

---

## Files Changed

| File | Change |
|---|---|
| `src/dashboard/input.js` | Rewrite `a` to scan; add `d` for scan-dir change; move manual entry to `A`; add `m` in scanner |
| `src/dashboard/render.js` | Add SYNC column, dirty branch coloring, PORTS section, updated footer |
| `src/dashboard/index.js` | Extend `getGitInfo` (parallel, cached at 5s); add `getPortInfo`; pass ports to render |
| `src/config.js` | Add `scan_dir` to DEFAULT_CONFIG; add `portscout_window` (default false) |
| `src/commands/up.js` | Update first-run to offer scan/manual choice; skip `ports` window when `portscout_window` is `false` |
| `src/selection.js` (new) | `parseSelection(input, max)` — pure function for number/range/*/mixed parsing |
| `src/ports/lsof.js` (new) | `getListeningPorts()` — lsof parsing (adapted from portscout) |
| `src/ports/categorize.js` (new) | `categorize(entries)` — dev/infra/system bucketing (adapted from portscout) |
| `src/ports/process.js` (new) | `getProcessDetails(pids)` — command, cwd, uptime for port entries |
| `test/selection.test.js` (new) | Unit tests for parseSelection |

---

## Scope

This is a v1.0 enhancement. New dependencies: none. The port logic is inlined from portscout, not imported as a dependency.

Out of scope: GitHub API integration (v2.0), fuzzy search, recursive directory scanning, bulk remove.
