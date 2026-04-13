import React from 'react'
import { Box, useInput } from 'ink'
import { writeFileSync } from 'node:fs'
import { saveTriggerPath } from '../paths.js'
import Header from './Header.js'
import ProjectTable from './ProjectTable.js'
import PortsSection from './PortsSection.js'
import ErrorBar from './ErrorBar.js'
import Footer from './Footer.js'

export default function DashboardView({ projects, state, gitInfo, portInfo, watcherAlive, lastError, onModeChange }) {
  useInput((input) => {
    switch (input) {
      case 'a': onModeChange('scan'); break
      case 'A': onModeChange('manual-add'); break
      case 'd': onModeChange('change-scandir'); break
      case 'w': onModeChange('worker'); break
      case 'r': onModeChange('remove'); break
      case 's':
        try { writeFileSync(saveTriggerPath(), '', { mode: 0o600 }) } catch {}
        break
      case 'q': onModeChange('shutdown'); break
      case '?': onModeChange('help'); break
      case ' ': onModeChange('palette'); break
    }
  })

  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Header, { projects, state, watcherAlive }),
    React.createElement(ProjectTable, { projects, state, gitInfo }),
    React.createElement(PortsSection, { portInfo }),
    React.createElement(ErrorBar, { error: lastError }),
    React.createElement(Footer, null),
  )
}
