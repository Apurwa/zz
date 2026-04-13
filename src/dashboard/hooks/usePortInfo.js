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
