# Dashboard TUI

> The live terminal interface that shows project status, git info, and ports.

**Source:** [`src/dashboard/`](../../src/dashboard/)

See also: [[architecture]](./architecture.md) | [[port-visibility]](./port-visibility.md) | [[session-persistence]](./session-persistence.md) | [[configuration]](./configuration.md)

---

## Overview

The dashboard is a full-screen Node.js TUI that runs inside the first tmux window. It renders a live view of all registered projects with git status, Claude session state, and listening ports. It refreshes every 2 seconds and accepts keyboard input for common operations.

---

## Startup

**Source:** [`src/dashboard/index.js`](../../src/dashboard/index.js)

1. `startDashboard()` sets `stdin` to raw mode for instant key response
2. Registers the keyboard input handler
3. Starts the render loop (2-second interval)
4. Monitors watcher health (respawns if dead)

---

## Render Loop

Every 2 seconds, `render()` executes:

```
1. Collect git info for all projects (parallel)
2. Collect port info (lsof + categorize + enrich)
3. Check watcher health
4. Call renderDashboard() to build output string
5. Clear screen and write output
```

### Render Pause

The render timer is **paused** during interactive prompts (scan, add, remove, etc.) to prevent the screen from clearing while the user is typing. It resumes after the prompt completes.

---

## Data Collection

### Git Info

For each registered project, collected in parallel via `Promise.all`:

| Data | Command | Cached |
|---|---|---|
| Branch | `git rev-parse --abbrev-ref HEAD` | 5s TTL |
| Dirty | `git status --porcelain` (non-empty = dirty) | 5s TTL |
| Ahead/Behind | `git rev-list --left-right --count HEAD...@{upstream}` | 5s TTL |
| Last commit | `git log -1 --format=%cr` | 5s TTL |

All git commands use a 3-second timeout. Failures return safe defaults (unknown branch, not dirty, no sync info).

**Cache invalidation:** The 5-second TTL cache is invalidated when projects are added or removed.

### Port Info

Collected via the [[port visibility]](./port-visibility.md) module:
1. `getListeningPorts()` -- lsof parse
2. `categorize()` -- dev/infra/system buckets
3. `getProcessDetails()` -- command, cwd, uptime enrichment

Also cached with 5-second TTL.

### Watcher Health

Reads `~/.cc/watcher.pid`, checks if that PID is alive. If dead, respawns the watcher in the hidden pane.

---

## Display Layout

**Source:** [`src/dashboard/render.js`](../../src/dashboard/render.js)

```
  zz  3 projects | 5 sessions | saved 12s ago

  watcher: healthy

  PROJECT        BRANCH       SYNC    SESSIONS   STATUS       LAST COMMIT
  my-app         main         ↑2 ↓0   2/3        ● active     2h ago
  api-server     feat/auth    ↑0 ↓1   1/2        ● active     45m ago
  shared-lib     main         =       0/2        ● ready      3d ago

  PORTS
  :3000  node      next dev        ~/Projects/my-app     2h 14m
  :3001  node      vite            ~/Projects/api        1h 02m
  :5432  Postgres                                        12h 3m

  [a] scan  [A] add  [d] scan-dir  [w] worker  [r] remove  [s] save  [q] quit  [?] help
```

### Header

Shows: project count, total session count, time since last save.

### Watcher Status

- Green: `watcher: healthy`
- Red: `watcher: not running` (with auto-respawn attempt)

### Project Table

| Column | Description |
|---|---|
| PROJECT | Alias from [[projects.json]](./configuration.md#projectsjson) |
| BRANCH | Current git branch. Yellow if working tree is dirty |
| SYNC | `↑N` ahead, `↓N` behind, `=` in sync, `--` no upstream |
| SESSIONS | Active / total panes (e.g., `2/3`) |
| STATUS | Aggregate: `active` if any Claude running, `ready` if none, `error`/`expired`/`stale` for problems |
| LAST COMMIT | Relative time from `git log` |

### Ports Section

Shows [[dev and infra ports]](./port-visibility.md#categories) with:
- Port number
- Process label
- Formatted command
- Working directory (tilde-contracted)
- Uptime

System ports are hidden. If `lsof` is unavailable, shows "unavailable".

### Footer

Keyboard shortcut reference.

---

## Keyboard Shortcuts

**Source:** [`src/dashboard/input.js`](../../src/dashboard/input.js)

| Key | Action | Description |
|---|---|---|
| `a` | Scan directory | Prompt for directory, list git repos, multi-select to add |
| `A` | Manual add | Prompt for a single project path |
| `d` | Change scan dir | Update the default scan directory in [[config]](./configuration.md#fields) |
| `w` | Add worker | List projects, select one, add a worker pane |
| `r` | Remove project | List projects, confirm, unregister |
| `s` | Save now | Write `~/.cc/save-trigger` file for the [[watcher]](./session-persistence.md#save-triggers) |
| `q` | Quit | Confirm, then run [[zz down]](./commands.md#down) |
| `?` | Help | Show full help screen, press any key to dismiss |
| `Ctrl+C` | Quit | Same as `q` |

### Interactive Prompts

All keyboard actions that require user input:

1. Pause the render loop (prevent screen clearing)
2. Exit raw mode on stdin
3. Create a readline interface for line input
4. Support `Escape` to cancel
5. Re-enter raw mode and resume rendering on completion

### Re-entrancy Guard

A `busy` flag prevents multiple prompts from overlapping. If a key is pressed while a prompt is active, it is ignored.

---

## Scan Directory Flow

When the user presses `a`:

```
1. Prompt: "Scan directory:" (default: config.scan_dir or ~/)
2. Read directory entries
3. Filter to git repositories (isGitRepo check)
4. Display numbered list with branch names
5. Prompt: "Select (comma-separated, ranges, or * for all):"
6. Parse selection via parseSelection()
7. Add selected repos to projects.json
8. Create tmux windows for new projects
```

The [[selection parser]](../../src/selection.js) supports: single numbers, comma-separated, ranges (`2-5`), wildcards (`*`), and mixed (`1,3-5,8`).

---

## Color Scheme

| Element | Color |
|---|---|
| Header text | Cyan, bold |
| Project alias | White |
| Branch (clean) | White |
| Branch (dirty) | Yellow |
| Sync arrows | Green (ahead), Red (behind), Dim (in sync) |
| Active status | Green |
| Ready status | Dim |
| Error/stale status | Red |
| Port numbers | Cyan |
| Footer shortcuts | Dim |
| Warnings | Yellow |
| Errors | Red |
