import React, { useState } from 'react'
import { Text, Box, useInput } from 'ink'
import SelectInput from 'ink-select-input'
import { readdirSync, lstatSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { contractTilde } from '../../paths.js'

const HIDDEN_DIRS = new Set(['.git', '.cache', '.npm', '.nvm', '.Trash', 'node_modules', '.superpowers'])

function listDirs(dirPath) {
  try {
    const entries = readdirSync(dirPath)
    return entries
      .filter((name) => {
        if (name.startsWith('.') || HIDDEN_DIRS.has(name)) return false
        try {
          const stat = lstatSync(join(dirPath, name))
          return stat.isDirectory() && !stat.isSymbolicLink()
        } catch { return false }
      })
      .sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

export default function DirBrowser({ onConfirm, onCancel }) {
  const [currentDir, setCurrentDir] = useState(homedir())

  const dirs = listDirs(currentDir)
  const items = [
    { label: '..', value: '..' },
    ...dirs.map((name) => ({ label: name + '/', value: name })),
  ]

  useInput((input, key) => {
    if (key.backspace || key.delete) {
      const parent = dirname(currentDir)
      if (parent !== currentDir) setCurrentDir(parent)
    }
    if (key.tab) {
      onConfirm(currentDir)
    }
  })

  const handleSelect = (item) => {
    if (item.value === '..') {
      const parent = dirname(currentDir)
      if (parent !== currentDir) setCurrentDir(parent)
    } else {
      setCurrentDir(join(currentDir, item.value))
    }
  }

  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Text, { bold: true }, `  Select directory: ${contractTilde(currentDir)}`),
    React.createElement(Text, { dimColor: true }, '  ─'.repeat(20)),
    React.createElement(Box, { paddingLeft: 2 },
      React.createElement(SelectInput, { items, onSelect: handleSelect, limit: 15 }),
    ),
    React.createElement(Text, null, ''),
    React.createElement(Text, { dimColor: true }, '  ↑↓ navigate  Enter open  Backspace up  Tab confirm  Ctrl+C cancel'),
  )
}
