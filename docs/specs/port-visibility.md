# Port Visibility

> How zz discovers and displays listening TCP ports.

**Source:** [`src/ports/`](../../src/ports/)

See also: [[architecture]](./architecture.md) | [[dashboard]](./dashboard.md) | [[configuration]](./configuration.md)

---

## Overview

zz shows which TCP ports are in use across all projects, categorized by type (dev servers, infrastructure, system). Port data is displayed inline in the [[dashboard]](./dashboard.md) and optionally in a dedicated tmux window (see [[portscout_window]](./configuration.md#fields)).

---

## Port Discovery

**Source:** [`src/ports/lsof.js`](../../src/ports/lsof.js)

### How Ports Are Found

Ports are discovered via `lsof`:

```bash
lsof -i -P -n -sTCP:LISTEN +c0
```

| Flag | Purpose |
|---|---|
| `-i` | List network files |
| `-P` | Show port numbers, not service names |
| `-n` | Show IP addresses, not hostnames |
| `-sTCP:LISTEN` | Only TCP sockets in LISTEN state |
| `+c0` | Show full command name (no truncation) |

### Parsing

Each `lsof` output line is parsed into:

```json
{
  "name": "node",
  "pid": 1234,
  "port": 3000,
  "host": "*"
}
```

**Deduplication:** Entries are deduped by `pid:port` key. Multiple file descriptors for the same process/port are collapsed.

**Error handling:** If `lsof` fails (e.g., permission denied), returns an empty array.

---

## Categorization

**Source:** [`src/ports/categorize.js`](../../src/ports/categorize.js)

Ports are sorted into three buckets:

### Categories

| Category | Criteria | Examples |
|---|---|---|
| **infra** | Process name matches a known infrastructure service | postgres, redis-server, mysqld, mongod, ollama |
| **dev** | Process is a known dev runtime AND port > 1024 | node, python, python3, deno, bun |
| **system** | Everything else | Low-numbered ports, unknown processes |

### Infra Label Mapping

| Process Name | Display Label |
|---|---|
| `redis-server` | Redis |
| `postgres` | Postgres |
| `mysqld` | MySQL |
| `mongod` | MongoDB |
| `ollama` | Ollama |

### Sort Order

- **Infra:** Sorted by predefined priority (Redis, Postgres, MySQL, MongoDB, Ollama)
- **Dev / System:** Sorted by port number ascending

### Output

```json
{
  "dev": [{ "name": "node", "pid": 1234, "port": 3000, ... }],
  "infra": [{ "name": "postgres", "pid": 567, "port": 5432, ... }],
  "system": []
}
```

---

## Process Enrichment

**Source:** [`src/ports/process.js`](../../src/ports/process.js)

After discovery and categorization, each port entry is enriched with runtime details.

### Enriched Fields

| Field | Source | Example |
|---|---|---|
| `command` | `ps -o args=` | `next dev` |
| `cwd` | `lsof -d cwd` | `~/Projects/my-app` |
| `uptime` | `ps -o lstart=` | `2h 14m` |

### Command Formatting

Raw process args are cleaned up for display. For example:

| Raw Args | Formatted |
|---|---|
| `/usr/local/bin/node /Users/x/Projects/app/node_modules/.bin/next dev` | `next dev` |
| `python3 -m http.server 8000` | `python3 -m http.server 8000` |

### Performance

All `ps` and `lsof` calls are batched per PID list, not issued per-port. `getCommands()` and `getCwds()` run in parallel via `Promise.all`.

---

## Caching

Port data is cached with a **5-second TTL** in the [[dashboard]](./dashboard.md). This prevents thrashing from the 2-second render loop while keeping data reasonably fresh.

---

## Dashboard Display

Ports are rendered in the dashboard under a `PORTS` section:

```
 PORTS
  :3000  node     next dev       ~/Projects/my-app   2h 14m
  :5432  Postgres                                     12h 3m
```

- Dev ports listed first, then infra
- System ports are hidden from the dashboard (too noisy)
- If `lsof` is unavailable, shows "unavailable"
