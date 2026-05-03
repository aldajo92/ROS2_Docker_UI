import { useMemo, useState } from 'react'
import { useTransportStatus } from '../app/useTransportStatus'
import { useTopicDiscovery } from '../app/useTopicDiscovery'
import { useTopicEcho } from '../app/useTopicEcho'
import { useRenderableTopics } from '../app/useRenderableTopics'
import { isSystemTopic, type TopicInfo } from '../app/TopicDiscovery'

/**
 * Inspector card that surfaces the active transport's topic-discovery
 * capability and (when maximized) live topic-echo controls. Today
 * this only renders for a connected rosbridge; the UI is kept generic
 * on purpose so adding DDS / MQTT / native discovery later is a
 * one-file change in `CommunicationProvider` and nothing here has to
 * move.
 *
 * Layout modes:
 *   - **Compact**: count + refresh + last-updated + collapsible list.
 *     Echo buttons are present but disabled (the card is too narrow
 *     for the usual JSON pretty-print, and dynamic subscriptions
 *     deserve more vertical real estate).
 *   - **Maximized**: same controls, but Echo buttons are enabled.
 *     The parent (App.tsx) usually hides sibling cards in this mode
 *     so the topic list and the resulting echo cards can grow.
 *
 * Architectural rule: this file does NOT import `roslib` and never
 * speaks rosapi-specific JSON. It consumes `topicDiscovery` and
 * `topicEcho` capabilities exposed by `CommunicationContext` and
 * renders generic `TopicInfo` rows.
 */

export interface Ros2TopicsPanelProps {
  /**
   * `true` when the panel is maximized to fill the inspector. Echo
   * actions become enabled in this mode. App.tsx owns the state so
   * sibling cards can be hidden in sync.
   */
  expanded?: boolean
  /** Notified when the user clicks the maximize / restore button. */
  onExpandedChange?: (expanded: boolean) => void
}

const ECHO_DISABLED_TOOLTIP_COMPACT = 'Maximize ROS2 Topics to echo topics.'
const ECHO_DISABLED_TOOLTIP_NO_ECHO = 'Echo capability is unavailable.'
const RENDER_UNAVAILABLE_TITLE = 'Topic rendering is unavailable.'

export function Ros2TopicsPanel({
  expanded = false,
  onExpandedChange,
}: Readonly<Ros2TopicsPanelProps> = {}) {
  const { config, status } = useTransportStatus()
  const discovery = useTopicDiscovery()
  const echo = useTopicEcho()
  const renderable = useRenderableTopics()

  // Strict gate: only rosbridge + connected. The provider also clears
  // the capability when those conditions don't hold, but defending
  // here keeps the test matrix tight and the panel impossible to
  // render in the wrong state via mocked context.
  const shouldRender =
    config.kind === 'rosbridge' && status === 'connected' && discovery !== undefined

  // Hooks must be called unconditionally — declare local UI state
  // BEFORE the early return so the hook order stays stable across
  // renders.
  const [listOpen, setListOpen] = useState(false)
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

  // Echo gating:
  //   - the capability must exist (rosbridge connected),
  //   - the panel must be maximized.
  // Both have to be true; in compact mode we keep the button visible
  // but disabled so the affordance is discoverable, with a tooltip
  // pointing the user at the maximize control.
  const echoEnabled = expanded && echo !== undefined
  const echoDisabledTitle = !expanded
    ? ECHO_DISABLED_TOOLTIP_COMPACT
    : ECHO_DISABLED_TOOLTIP_NO_ECHO
  const handleEchoClick = (topic: TopicInfo) => {
    if (!echoEnabled || !echo) return
    echo.startEcho(topic)
  }

  const expandLabel = expanded
    ? 'Collapse ROS2 Topics'
    : 'Expand ROS2 Topics'

  const sectionClassName = expanded
    ? 'panel ros2-topics-panel ros2-topics-panel--expanded'
    : 'panel ros2-topics-panel'

  return (
    <section className={sectionClassName} aria-label="ROS2 Topics">
      <div className="ros2-topics-header">
        <h2>ROS2 Topics</h2>
        <button
          type="button"
          className="ros2-topics-expand-button"
          onClick={() => onExpandedChange?.(!expanded)}
          aria-pressed={expanded}
          aria-label={expandLabel}
          title={expandLabel}
          data-testid="ros2-topics-expand"
        >
          <span aria-hidden="true">{expanded ? '\u2921' : '\u2922'}</span>
        </button>
      </div>

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
          onClick={() => setListOpen((v) => !v)}
          aria-expanded={listOpen}
          aria-controls="ros2-topics-list"
        >
          {listOpen ? 'Hide topics' : 'Show topics'}
        </button>
      </div>

      {/*
        The system-topics toggle is contextual to the visible list: it
        only changes what the user sees when rows are on screen.
        Hiding it while collapsed keeps the summary compact and avoids
        a control whose effect isn't visible.
      */}
      {listOpen && (
        <label className="ros2-topics-system-toggle">
          <input
            type="checkbox"
            checked={showSystemTopics}
            onChange={(e) => setShowSystemTopics(e.target.checked)}
          />
          <span>Show system topics</span>
        </label>
      )}

      {listOpen && (
        <ul id="ros2-topics-list" className="ros2-topics-list">
          {visibleTopics.length === 0 && (
            <li className="ros2-topics-empty">
              {isLoading
                ? 'Loading topics…'
                : 'No topics to display.'}
            </li>
          )}
          {visibleTopics.map((topic) => {
            // Per-row render-checkbox state. We treat a missing
            // `renderable` capability as "render selection unavailable"
            // — the checkbox stays disabled but visible so the affordance
            // is consistent across the matrix (rosbridge-disconnected
            // never gets here; this guards mock context in tests).
            const isRenderable =
              renderable?.isRenderable(topic) ?? false
            const isSelected =
              isRenderable && (renderable?.isSelected(topic.name) ?? false)
            const renderDisabledReason = renderable
              ? renderable.getUnsupportedReason(topic)
              : RENDER_UNAVAILABLE_TITLE
            const renderTitle = isRenderable
              ? isSelected
                ? `Stop rendering ${topic.name}`
                : `Render ${topic.name} in the viewport`
              : (renderDisabledReason ?? RENDER_UNAVAILABLE_TITLE)
            const handleRenderToggle = () => {
              if (!renderable || !isRenderable) return
              if (isSelected) renderable.deselectTopic(topic.name)
              else renderable.selectTopic(topic)
            }
            return (
              <li key={topic.name} className="ros2-topics-row">
                <input
                  type="checkbox"
                  className="ros2-topics-render-checkbox"
                  data-testid={`ros2-topics-render-${topic.name}`}
                  checked={isSelected}
                  disabled={!isRenderable}
                  onChange={handleRenderToggle}
                  aria-label={
                    isRenderable
                      ? `Render ${topic.name}`
                      : `${topic.name} cannot be rendered`
                  }
                  title={renderTitle}
                />
                <span className="ros2-topics-name" title={topic.name}>
                  {topic.name}
                </span>
                <span className="ros2-topics-type" title={topic.type ?? ''}>
                  {topic.type ?? '—'}
                </span>
                <button
                  type="button"
                  className="ros2-topics-action"
                  disabled={!echoEnabled}
                  title={
                    echoEnabled ? `Echo ${topic.name}` : echoDisabledTitle
                  }
                  onClick={() => handleEchoClick(topic)}
                >
                  Echo
                </button>
              </li>
            )
          })}
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
