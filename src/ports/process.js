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
