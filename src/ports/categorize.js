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
