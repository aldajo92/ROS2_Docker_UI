import { useMemo, useState } from 'react'
import { useTransportStatus } from '../app/useTransportStatus'
import { useTopicDiscovery } from '../app/useTopicDiscovery'
import { isSystemTopic, type TopicInfo } from '../app/TopicDiscovery'

/**
 * Inspector card that surfaces the active transport's topic-discovery
 * capability. Today this only renders for a connected rosbridge; the
 * UI is kept generic on purpose so adding DDS / MQTT / native discovery
 * later is a one-file change in `CommunicationProvider` and nothing
 * here has to move.
 *
 * Architectural rule: this file does NOT import `roslib` and never
 * speaks rosapi-specific JSON. It consumes the
 * `topicDiscovery` capability exposed by `CommunicationContext` and
 * renders generic `TopicInfo` rows.
 */
export function Ros2TopicsPanel() {
  const { config, status } = useTransportStatus()
  const discovery = useTopicDiscovery()

  // Strict gate: only rosbridge + connected. The provider also clears
  // the capability when those conditions don't hold, but defending
  // here keeps the test matrix tight and the panel impossible to
  // render in the wrong state via mocked context.
  const shouldRender =
    config.kind === 'rosbridge' && status === 'connected' && discovery !== undefined

  // Hooks must be called unconditionally — declare local UI state
  // BEFORE the early return so the hook order stays stable across
  // renders.
  const [expanded, setExpanded] = useState(false)
  const [showSystemTopics, setShowSystemTopics] = useState(false)

  const visibleTopics = useMemo<TopicInfo[]>(() => {
    if (!discovery) return []
    const filtered = showSystemTopics
      ? discovery.topics
      : discovery.topics.filter((t) => !isSystemTopic(t.name))
    // Alphabetical ordering keeps the list scan-friendly and makes
    // the rendered output deterministic regardless of what order the
    // underlying transport happened to return topics in.
    return [...filtered].sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    )
  }, [discovery, showSystemTopics])

  if (!shouldRender || !discovery) return null

  const isLoading = discovery.status === 'loading'
  const hasError = discovery.status === 'error'
  const hasEverLoaded = discovery.lastUpdated !== undefined
  const lastUpdatedLabel = hasEverLoaded
    ? formatLastUpdated(discovery.lastUpdated as number)
    : undefined

  const refreshLabel = isLoading ? 'Refreshing…' : 'Refresh topics'

  return (
    <section className="panel ros2-topics-panel" aria-label="ROS2 Topics">
      <h2>ROS2 Topics</h2>

      <div className="ros2-topics-summary">
        <span className="ros2-topics-count">
          Topics: {visibleTopics.length} discovered
        </span>
        <button
          type="button"
          className="ros2-topics-refresh"
          onClick={discovery.refresh}
          disabled={isLoading}
        >
          {refreshLabel}
        </button>
      </div>

      {lastUpdatedLabel && (
        <p className="ros2-topics-meta">
          Last updated: <span>{lastUpdatedLabel}</span>
        </p>
      )}

      {hasError && discovery.error && (
        <p className="ros2-topics-error" role="alert">
          {discovery.error}
        </p>
      )}

      <div className="ros2-topics-controls">
        <button
          type="button"
          className="ros2-topics-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="ros2-topics-list"
        >
          {expanded ? 'Hide topics' : 'Show topics'}
        </button>
      </div>

      {/*
        The system-topics toggle is contextual to the visible list: it
        only changes what the user sees when rows are on screen.
        Hiding it while collapsed keeps the summary compact and avoids
        a control whose effect isn't visible.
      */}
      {expanded && (
        <label className="ros2-topics-system-toggle">
          <input
            type="checkbox"
            checked={showSystemTopics}
            onChange={(e) => setShowSystemTopics(e.target.checked)}
          />
          <span>Show system topics</span>
        </label>
      )}

      {expanded && (
        <ul id="ros2-topics-list" className="ros2-topics-list">
          {visibleTopics.length === 0 && (
            <li className="ros2-topics-empty">
              {isLoading
                ? 'Loading topics…'
                : 'No topics to display.'}
            </li>
          )}
          {visibleTopics.map((topic) => (
            <li key={topic.name} className="ros2-topics-row">
              <span className="ros2-topics-name" title={topic.name}>
                {topic.name}
              </span>
              <span className="ros2-topics-type" title={topic.type ?? ''}>
                {topic.type ?? '—'}
              </span>
              <button
                type="button"
                className="ros2-topics-action"
                disabled
                title="Topic echo coming next"
              >
                Echo
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * `Date.toLocaleTimeString` formatted to `H:MM:SS AM/PM` (matches the
 * reference UX). Pure for testability; happy-dom respects the
 * `Intl` settings the user's machine has, which is fine for UI.
 */
function formatLastUpdated(epochMs: number): string {
  const d = new Date(epochMs)
  return d.toLocaleTimeString()
}
