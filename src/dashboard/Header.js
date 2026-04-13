import React from 'react'
import { Text } from 'ink'
import { timeSince } from '../paths.js'

export default function Header({ projects, state, watcherAlive }) {
  const totalSessions = countSessions(projects, state)
  const savedAgo = state.saved_at ? timeSince(new Date(state.saved_at)) : 'never'

  return React.createElement(React.Fragment, null,
    React.createElement(Text, null,
      React.createElement(Text, { bold: true, color: 'cyan' }, 'zz'),
      React.createElement(Text, { dimColor: true }, ` · ${projects.length} project${projects.length === 1 ? '' : 's'}`),
      React.createElement(Text, { dimColor: true }, ` · ${totalSessions} session${totalSessions === 1 ? '' : 's'}`),
      React.createElement(Text, { dimColor: true }, ` · saved ${savedAgo} ago`),
    ),
    React.createElement(Text, { dimColor: watcherAlive, color: watcherAlive ? undefined : 'red' },
      watcherAlive ? '  watcher healthy' : '  ⚠ watcher dead'
    ),
  )
}

function countSessions(projects, state) {
  let count = 0
  for (const project of projects) {
    const entry = state.projects?.[project.path]
    if (entry?.panes) {
      count += entry.panes.filter((p) => p.claude_session_id).length
    }
  }
  return count
}
