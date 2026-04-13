import React, { useState, useEffect } from 'react'
import { Text, Box } from 'ink'
import TextInput from 'ink-text-input'
import { existsSync, readdirSync, lstatSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'
import { execFileSync } from 'node:child_process'
import { readConfig, updateConfig, readProjects, addProject } from '../../config.js'
import { expandTilde, contractTilde, isGitRepo } from '../../paths.js'
import { parseSelection } from '../../selection.js'

export default function ScanPrompt({ onDone }) {
  const config = readConfig()
  const [step, setStep] = useState(config.scan_dir ? 'list' : 'ask-dir')
  const [scanDir, setScanDir] = useState(config.scan_dir ? expandTilde(config.scan_dir) : '')
  const [value, setValue] = useState('')
  const [error, setError] = useState(null)
  const [repos, setRepos] = useState(null)
  const [alreadyAdded, setAlreadyAdded] = useState(0)
  const [message, setMessage] = useState(null)

  // Scan when entering list step
  useEffect(() => {
    if (step !== 'list' || repos !== null) return

    const dir = scanDir || expandTilde(config.scan_dir || '')
    if (!dir || !existsSync(dir)) {
      setStep('ask-dir')
      setError(`Directory not found: ${contractTilde(dir)}`)
      return
    }

    const registered = readProjects()
    const registeredPaths = new Set(registered.map((p) => resolve(expandTilde(p.path))))
    const found = []
    let addedCount = 0

    try {
      for (const entry of readdirSync(dir)) {
        const fullPath = join(dir, entry)
        try {
          const stat = lstatSync(fullPath)
          if (!stat.isDirectory() || stat.isSymbolicLink()) continue
        } catch { continue }

        const resolved = resolve(fullPath)
        if (registeredPaths.has(resolved)) { addedCount++; continue }

        if (isGitRepo(fullPath)) {
          let branch = '?'
          try { branch = execFileSync('git', ['-C', fullPath, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf-8', timeout: 3000 }).trim() } catch { /* ignore */ }
          found.push({ name: basename(fullPath), path: fullPath, branch })
        }
      }
    } catch (err) {
      setMessage(`Failed to scan: ${err.message}`)
      setTimeout(onDone, 1500)
      return
    }

    found.sort((a, b) => a.name.localeCompare(b.name))
    setRepos(found)
    setAlreadyAdded(addedCount)

    if (found.length === 0) {
      let msg = `No new git repos found in ${contractTilde(dir)}.`
      if (addedCount > 0) msg += ` (${addedCount} already added)`
      setMessage(msg)
      setTimeout(onDone, 1500)
    }
  }, [step, repos])

  // Ask for scan directory
  if (step === 'ask-dir') {
    const handleDirSubmit = (input) => {
      if (!input) { onDone(); return }
      const dir = expandTilde(input)
      if (!existsSync(dir)) {
        setError(`Directory not found: ${input}`)
        setValue('')
        return
      }
      updateConfig(undefined, { scan_dir: contractTilde(dir) })
      setScanDir(dir)
      setStep('list')
      setRepos(null)
      setValue('')
      setError(null)
    }

    return React.createElement(Box, { flexDirection: 'column' },
      error && React.createElement(Text, { color: 'red' }, `  ${error}`),
      React.createElement(Box, null,
        React.createElement(Text, null, '  Scan directory: '),
        React.createElement(TextInput, { value, onChange: setValue, onSubmit: handleDirSubmit }),
      ),
      React.createElement(Text, { dimColor: true }, '  (Ctrl+C to cancel)'),
    )
  }

  // Show message (scanning result)
  if (message) {
    return React.createElement(Text, { dimColor: true }, `  ${message}`)
  }

  // Loading
  if (!repos) {
    return React.createElement(Text, { dimColor: true }, `  Scanning ${contractTilde(scanDir)}...`)
  }

  // Show repo list and selection
  const handleSelection = (input) => {
    if (!input) { onDone(); return }
    if (input === 'm') { onDone('manual-add'); return }

    const indices = parseSelection(input, repos.length)
    if (indices.length === 0) { onDone(); return }

    const cfg = readConfig()
    const addedProjects = []
    const addedNames = []
    for (const idx of indices) {
      const repo = repos[idx - 1]
      const alias = repo.name.toLowerCase()
      const project = { path: repo.path, workers: cfg.default_workers, alias }
      const ok = addProject(undefined, project)
      if (ok) {
        addedProjects.push(project)
        addedNames.push(alias)
      }
    }

    setMessage(`Added ${addedNames.length} project${addedNames.length === 1 ? '' : 's'}: ${addedNames.join(', ')}`)
    setTimeout(() => onDone(null, addedProjects), 1000)
  }

  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Text, { dimColor: true }, `  Scanning ${contractTilde(scanDir)}...\n`),
    ...repos.map((repo, i) =>
      React.createElement(Text, { key: i }, `  ${String(i + 1).padStart(2)}. ${repo.name.padEnd(22)} ${repo.branch}`)
    ),
    alreadyAdded > 0 && React.createElement(Text, { dimColor: true }, `  (${alreadyAdded} repo${alreadyAdded === 1 ? '' : 's'} already added, hidden)`),
    React.createElement(Text, null, ''),
    React.createElement(Box, null,
      React.createElement(Text, null, '  Select (comma-separated, ranges, or * for all) [m] manual: '),
      React.createElement(TextInput, { value, onChange: setValue, onSubmit: handleSelection }),
    ),
    React.createElement(Text, { dimColor: true }, '  (Ctrl+C to cancel)'),
  )
}
