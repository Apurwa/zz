# Dashboard Improvements: Directory Scanner + Git Status

**Date:** 2026-04-12
**Status:** Approved
**Author:** Apurwa

## Overview

Two enhancements to the `zz` dashboard: (1) a directory scanner for adding projects without typing paths, and (2) enriched git status indicators showing dirty state and ahead/behind remote.

---

## Feature 1: Directory Scanner

### Behavior

**`a` key (scan):**

1. If `scan_dir` is not configured in `~/.cc/config.json`, prompt: `Scan directory: _`
2. Save the entered value as `scan_dir` in config for future reuse.
3. Scan `scan_dir` for immediate subdirectories that are git repos.
4. Display a numbered list:

```
  Scanning ~/Projects...

  1. api                  main ✱ ↑2
  2. frontend             dev
  3. infra                main
  4. mobile-app           main ↑1 ↓3
  ─────────────────────────────────
  portscout              (already added)

  Select (comma-separated, ranges, or * for all): 1-3
  Adding 3 projects...
  ✓ api
  ✓ frontend
  ✓ infra
```

**List ordering:**
- Selectable git repos first, sorted alphabetically
- Already-added projects at the bottom, greyed out, separated by a divider
- Non-git directories are not shown

**Selection format:**
- Single numbers: `1`
- Comma-separated: `1,3,5`
- Ranges: `1-4`
- Mixed: `1-3,5,8`
- All: `*` (adds all selectable git repos)
- Empty/Ctrl-C: cancel, return to dashboard

**Error handling:**
- If `scan_dir` is configured but the directory no longer exists, print `Directory not found: <path>` and re-prompt for a new path.
- If `scan_dir` contains zero git repos, print `No git repos found in <path>.` and return to dashboard.

**After selection:**
- Print confirmation: `Adding N projects...`
- Print each added project with green checkmark
- Return to dashboard after 1 second

**`A` key (shift-A, manual path entry):**
- Same as current `a` behavior: prompt for a path, validate, add.
- Power user fallback for paths outside `scan_dir`.

### First-Run Integration

When `zz up` runs with zero projects registered and cwd is NOT a git repo:

Current behavior: prints "No projects registered" and exits.

New behavior:
```
  No projects registered.
  Scan a directory for git repos? Enter path (or Ctrl-C to exit): _
```

User enters a path. Scanner runs. User selects projects. Boot continues.

This replaces the early exit — users always get a path to adding projects.

### Config Change

`~/.cc/config.json` gains an optional field:

```json
{
  "default_workers": 2,
  "auto_save_interval": 30,
  "portscout": true,
  "scan_dir": null
}
```

`scan_dir` is `null` by default. Set automatically on first scan. User can edit it manually.

---

## Feature 2: Enhanced Git Status

### Dashboard Table Changes

Current columns: `PROJECT | BRANCH | SESSIONS | STATUS | LAST COMMIT`

New columns: `PROJECT | BRANCH | SYNC | SESSIONS | STATUS | LAST COMMIT`

**BRANCH column:**
- Appends `✱` when there are uncommitted changes (dirty working tree)
- Example: `main ✱` or `dev ✱`

**SYNC column (new):**
- `↑N` — commits ahead of remote
- `↓N` — commits behind remote
- `↑N ↓M` — both ahead and behind
- `=` — in sync with remote
- `?` — no remote tracking branch

### Git Data Collection

The `getGitInfo` function in `src/dashboard/index.js` is extended to collect:

1. **Branch name:** `git rev-parse --abbrev-ref HEAD` (existing)
2. **Dirty state:** `git status --porcelain` — if output is non-empty, working tree is dirty
3. **Ahead/behind:** `git rev-list --left-right --count HEAD...@{upstream}` — returns `ahead\tbehind`
4. **Last commit:** `git log -1 --format=%cr` (existing)

The returned `gitInfo` object changes from:
```js
{ branch: 'main', lastCommit: '2h ago' }
```
to:
```js
{ branch: 'main', dirty: true, ahead: 2, behind: 0, lastCommit: '2h ago' }
```

### Render Changes

In `src/dashboard/render.js`, the table row for each project changes:

```js
// Branch column: append ✱ if dirty
const branchDisplay = git.dirty ? `${git.branch} ✱` : git.branch

// Sync column
let syncDisplay = '='
if (git.ahead > 0 && git.behind > 0) syncDisplay = `↑${git.ahead} ↓${git.behind}`
else if (git.ahead > 0) syncDisplay = `↑${git.ahead}`
else if (git.behind > 0) syncDisplay = `↓${git.behind}`
```

---

## Files Changed

| File | Change |
|---|---|
| `src/dashboard/input.js` | Rewrite `a` handler to scan; add `A` handler for manual path |
| `src/dashboard/render.js` | Add SYNC column, dirty indicator on BRANCH |
| `src/dashboard/index.js` | Extend `getGitInfo` with dirty + ahead/behind |
| `src/config.js` | Add `scan_dir` to DEFAULT_CONFIG |
| `src/commands/up.js` | Update first-run to prompt for scan directory instead of exiting |
| `src/paths.js` | Add `scanDirPath` helper (or reuse configPath) |

No new files needed. All changes are modifications to existing modules.

---

## Scope

This is a v1.0 enhancement — no new dependencies, no new subsystems. The scanner reuses existing `addProject` and `isGitRepo` functions. The git status uses standard `git` commands already available.

Out of scope: GitHub API integration (v2.0), fuzzy search, recursive directory scanning.
