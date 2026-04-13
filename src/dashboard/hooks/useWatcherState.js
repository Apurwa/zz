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
