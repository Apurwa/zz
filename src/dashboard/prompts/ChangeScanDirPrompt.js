import React, { useState } from 'react'
import { Text } from 'ink'
import { readConfig, updateConfig } from '../../config.js'
import { contractTilde } from '../../paths.js'
import DirBrowser from '../components/DirBrowser.js'

export default function ChangeScanDirPrompt({ onDone }) {
  const config = readConfig()
  const [done, setDone] = useState(false)

  const handleConfirm = (dir) => {
    updateConfig(undefined, { scan_dir: contractTilde(dir) })
    setDone(true)
    setTimeout(onDone, 500)
  }

  if (done) return React.createElement(Text, { color: 'green' }, '  ✓ Scan directory updated')

  return React.createElement(DirBrowser, { onConfirm: handleConfirm, onCancel: onDone })
}
