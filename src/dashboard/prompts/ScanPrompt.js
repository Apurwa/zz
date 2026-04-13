import React, { useState, useEffect } from 'react'
import { Text, Box } from 'ink'
import SelectInput from 'ink-select-input'
import { existsSync, readdirSync, lstatSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'
import { execFileSync } from 'node:child_process'
import { readConfig, updateConfig, readProjects, addProject } from '../../config.js'
import { expandTilde, contractTilde, isGitRepo } from '../../paths.js'
import MultiSelect from '../components/MultiSelect.js'
import DirBrowser from '../components/DirBrowser.js'

export default function ScanPrompt({ onDone }) {
  const config = readConfig()
  const hasScanDir = config.scan_dir && existsSync(expandTilde(config.scan_dir))
  const [step, setStep] = useState('menu')
  const [scanDir, setScanDir] = useState(hasScanDir ? expandTilde(config.scan_dir) : '')
  const [error, setError] = useState(null)
  const [repos, setRepos] = useState(null)
  const [alreadyAdded, setAlreadyAdded] = useState(0)
  const [message, setMessage] = useState(null)

  // Menu step
  if (step === 'menu') {
    const menuItems = []
    if (hasScanDir) {
      menuItems.push({ label: `Scan ${contractTilde(expandTilde(config.scan_dir))}`, value: 'scan' })
    }
    menuItems.push({ label: 'Scan a different directory', value: 'ask-dir' })
    menuItems.push({ label: 'Enter path manually', value: 'manual' })

    const handleMenuSelect = (item) => {
      if (item.value === 'scan') {
        setStep('scanning')
      } else if (item.value === 'ask-dir') {
        setStep('ask-dir')
      } else if (item.value === 'manual') {
        onDone('manual-add')
      }
    }

    return React.createElement(Box, { flexDirection: 'column' },
      React.createElement(Text, { bold: true }, '  Add project:'),
      React.createElement(Text, null, ''),
      React.createElement(Box, { paddingLeft: 2 },
        React.createElement(SelectInput, { items: menuItems, onSelect: handleMenuSelect }),
      ),
    )
  }

  // Ask for scan directory
  if (step === 'ask-dir') {
    const handleDirConfirm = (dir) => {
      updateConfig(undefined, { scan_dir: contractTilde(dir) })
      setScanDir(dir)
      setStep('scanning')
      setError(null)
    }

    return React.createElement(DirBrowser, { onConfirm: handleDirConfirm, onCancel: () => onDone() })
  }

  // Scanning step — run scan in useEffect
  useEffect(() => {
    if (step !== 'scanning' || repos !== null) return

    const dir = scanDir
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
          try { branch = execFileSync('git', ['-C', fullPath, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf-8', timeout: 3000 }).trim() } catch {}
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

  // Show message
  if (message) {
    return React.createElement(Text, { dimColor: true }, `  ${message}`)
  }

  // Loading
  if (step === 'scanning' && !repos) {
    return React.createElement(Text, { dimColor: true }, `  Scanning ${contractTilde(scanDir)}...`)
  }

  // Show multi-select
  if (repos && repos.length > 0) {
    const items = repos.map((repo) => ({
      label: repo.name.padEnd(22) + repo.branch,
      hint: '',
    }))

    const handleSelect = (selectedIndices) => {
      if (selectedIndices.length === 0) { onDone(); return }

      const cfg = readConfig()
      const addedProjects = []
      const addedNames = []
      for (const idx of selectedIndices) {
        const repo = repos[idx]
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
      React.createElement(Text, { dimColor: true }, `  Scanning ${contractTilde(scanDir)}...`),
      alreadyAdded > 0 && React.createElement(Text, { dimColor: true }, `  (${alreadyAdded} already added, hidden)`),
      React.createElement(Text, null, ''),
      React.createElement(MultiSelect, { items, onSubmit: handleSelect }),
    )
  }

  return null
}
