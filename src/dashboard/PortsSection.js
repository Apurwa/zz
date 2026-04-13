import React from 'react'
import { Text, Box } from 'ink'

export default function PortsSection({ portInfo }) {
  if (portInfo === null) {
    return React.createElement(Box, { flexDirection: 'column' },
      React.createElement(Text, null,
        React.createElement(Text, { dimColor: true }, '  PORTS'),
        React.createElement(Text, { color: 'red' }, '  unavailable'),
      ),
    )
  }

  if (portInfo.length === 0) {
    return React.createElement(Box, { flexDirection: 'column' },
      React.createElement(Text, null,
        React.createElement(Text, { dimColor: true }, '  PORTS'),
        React.createElement(Text, { dimColor: true }, '  none'),
      ),
    )
  }

  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Text, { dimColor: true }, '  PORTS'),
    ...portInfo.map((port, i) =>
      React.createElement(Text, { key: i },
        React.createElement(Text, { color: 'cyan' }, `  :${port.port}`.padEnd(9)),
        React.createElement(Text, { dimColor: true }, (port.label || '').padEnd(10)),
        React.createElement(Text, null, (port.command || '').padEnd(22)),
        React.createElement(Text, { dimColor: true }, (port.cwd || '').padEnd(28)),
        React.createElement(Text, { dimColor: true }, port.uptime || ''),
      )
    ),
  )
}
