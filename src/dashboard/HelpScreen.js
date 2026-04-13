import React from 'react'
import { Text, Box, useInput } from 'ink'

export default function HelpScreen({ onDone }) {
  useInput(() => {
    onDone()
  })

  return React.createElement(Box, { flexDirection: 'column', padding: 1 },
    React.createElement(Text, { bold: true }, '  Keyboard Shortcuts'),
    React.createElement(Text, null, ''),
    React.createElement(Text, null, '  ', React.createElement(Text, { bold: true }, 'a'), '  Scan directory — find and add git repos'),
    React.createElement(Text, null, '  ', React.createElement(Text, { bold: true }, 'A'), '  Add path manually — type a project path'),
    React.createElement(Text, null, '  ', React.createElement(Text, { bold: true }, 'd'), '  Change scan directory'),
    React.createElement(Text, null, '  ', React.createElement(Text, { bold: true }, 'w'), '  Add worker — spawns new worker pane in a project'),
    React.createElement(Text, null, '  ', React.createElement(Text, { bold: true }, 'r'), '  Remove project — with confirmation'),
    React.createElement(Text, null, '  ', React.createElement(Text, { bold: true }, 's'), '  Save state now — triggers immediate save'),
    React.createElement(Text, null, '  ', React.createElement(Text, { bold: true }, 'q'), '  Shutdown — graceful shutdown with confirmation'),
    React.createElement(Text, null, '  ', React.createElement(Text, { bold: true }, 'Ctrl+C'), ' Cancel any prompt'),
    React.createElement(Text, null, '  ', React.createElement(Text, { bold: true }, '?'), '  This help screen'),
    React.createElement(Text, null, ''),
    React.createElement(Text, { dimColor: true }, '  Press any key to return to dashboard...'),
  )
}
