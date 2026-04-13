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
