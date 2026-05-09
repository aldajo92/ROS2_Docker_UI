import { useCallback, useMemo, useState } from 'react'
import { useTransportStatus } from '../app/useTransportStatus'
import { useTopicDiscovery } from '../app/useTopicDiscovery'
import { useTopicEcho } from '../app/useTopicEcho'
import { useRenderableTopics } from '../app/useRenderableTopics'
import { isSystemTopic, type TopicInfo } from '../app/TopicDiscovery'
import { DEFAULT_PATH_VISUAL_CONFIG } from '../app/RenderableTopics'

const POSE_ARRAY_MESSAGE_TYPE = 'geometry_msgs/msg/PoseArray'
const TWIST_MESSAGE_TYPE = 'geometry_msgs/msg/Twist'

/**
 * Compact descriptor for a vehicle entity that the panel offers as a
 * Twist-binding target. Kept renderer- and simulation-agnostic so the
 * panel never reaches into `EntityManager`.
 */
export interface TwistControlVehicleOption {
  id: string
  label: string
}

export interface TwistControlBindingSelection {
  vehicleId: string
  enabled: boolean
}

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
  /**
   * Vehicle entities the user can bind a `geometry_msgs/msg/Twist`
   * topic to. Derived from the active scenario in `App.tsx`. Empty /
   * undefined disables the dropdown with a "No vehicles" hint.
   */
  twistControlVehicles?: ReadonlyArray<TwistControlVehicleOption>
  /**
   * Map of `topic.name` → selected vehicle + enabled state for
   * `geometry_msgs/msg/Twist` topics. App.tsx owns the canonical state
   * so the binding survives panel collapse / expand / refresh cycles.
   */
  twistControlBindings?: Readonly<Record<string, TwistControlBindingSelection>>
  /**
   * Called when the user changes the vehicle dropdown for a Twist
   * topic. The empty-string value (`''`) means "unbind" — the parent
   * removes the entry from its binding map.
   */
  onTwistControlBindingChange?: (topic: string, vehicleId: string) => void
  /**
   * Called when the user toggles the checkbox for a Twist topic. This
   * is deliberately separate from renderable-topic selection: Twist is
   * control/interaction, not visualization.
   */
  onTwistControlEnabledChange?: (topic: string, enabled: boolean) => void
}

const TWIST_DROPDOWN_NO_VEHICLES_LABEL = 'No vehicles'
const TWIST_DROPDOWN_UNBOUND_VALUE = ''
const TWIST_DROPDOWN_UNBOUND_LABEL = 'Select vehicle'

const ECHO_DISABLED_TOOLTIP_COMPACT = 'Maximize ROS2 Topics to echo topics.'
const ECHO_DISABLED_TOOLTIP_NO_ECHO = 'Echo capability is unavailable.'
const RENDER_UNAVAILABLE_TITLE = 'Topic rendering is unavailable.'

export function Ros2TopicsPanel({
  expanded = false,
  onExpandedChange,
  twistControlVehicles,
  twistControlBindings,
  onTwistControlBindingChange,
  onTwistControlEnabledChange,
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
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set())
  const [hexInputs, setHexInputs] = useState<Map<string, string>>(new Map())

  const toggleExpanded = useCallback((topicName: string) => {
    setExpandedTopics((prev) => {
      const next = new Set(prev)
      if (next.has(topicName)) next.delete(topicName)
      else next.add(topicName)
      return next
    })
  }, [])

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
            // A row can expose either a visualization capability
            // (Path/PoseArray) or a control capability (Twist). Keep
            // those meanings separate: Twist is not renderable, but it
            // still gets an enabled checkbox and expandable settings.
            const isTwistControl = topic.type === TWIST_MESSAGE_TYPE
            const isRenderable =
              renderable?.isRenderable(topic) ?? false
            const isSelected =
              isRenderable && (renderable?.isSelected(topic.name) ?? false)
            const twistBinding = twistControlBindings?.[topic.name]
            const twistEnabled = twistBinding?.enabled ?? false
            const twistSelectedVehicleId = twistBinding?.vehicleId ?? ''
            const hasTwistVehicles = (twistControlVehicles?.length ?? 0) > 0
            const twistCheckboxDisabled =
              !onTwistControlEnabledChange || (!hasTwistVehicles && !twistBinding)
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
            const canExpand = isRenderable || isTwistControl
            const rowChecked = isTwistControl ? twistEnabled : isSelected
            const rowCheckboxDisabled = isTwistControl
              ? twistCheckboxDisabled
              : !isRenderable
            const rowCheckboxTitle = isTwistControl
              ? twistEnabled
                ? `Disconnect ${topic.name} from vehicle control`
                : hasTwistVehicles
                  ? `Connect ${topic.name} to vehicle control`
                  : 'No controllable vehicles in this scenario'
              : renderTitle
            const rowCheckboxAriaLabel = isTwistControl
              ? twistEnabled
                ? `Disconnect ${topic.name} from vehicle control`
                : `Connect ${topic.name} to vehicle control`
              : isRenderable
                ? `Render ${topic.name}`
                : `${topic.name} cannot be rendered`
            const handleRowCheckboxToggle = () => {
              if (isTwistControl) {
                if (twistCheckboxDisabled) return
                onTwistControlEnabledChange?.(topic.name, !twistEnabled)
                return
              }
              handleRenderToggle()
            }
            const isExpanded = expandedTopics.has(topic.name)
            const visualConfig =
              renderable?.getVisualConfig?.(topic.name) ?? DEFAULT_PATH_VISUAL_CONFIG
            const hexValue = hexInputs.get(topic.name) ?? visualConfig.color
            const hexValid = /^#[0-9a-fA-F]{6}$/.test(hexValue)

            const handleColorPicker = (c: string) => {
              setHexInputs((prev) => new Map(prev).set(topic.name, c))
              renderable?.setVisualConfig?.(topic.name, { color: c })
            }
            const handleHexInput = (raw: string) => {
              setHexInputs((prev) => new Map(prev).set(topic.name, raw))
              if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
                renderable?.setVisualConfig?.(topic.name, { color: raw })
              }
            }

            return (
              <li key={topic.name} className="ros2-topics-row">
                <button
                  type="button"
                  className={
                    'ros2-topics-chevron' +
                    (!canExpand ? ' ros2-topics-chevron--disabled' : '')
                  }
                  onClick={() => canExpand && toggleExpanded(topic.name)}
                  disabled={!canExpand}
                  aria-expanded={canExpand ? isExpanded : undefined}
                  aria-label={
                    canExpand
                      ? isExpanded
                        ? `Collapse settings for ${topic.name}`
                        : `Expand settings for ${topic.name}`
                      : 'No settings available'
                  }
                  title={
                    canExpand
                      ? isExpanded ? 'Collapse settings' : 'Expand settings'
                      : 'No settings available'
                  }
                  data-testid={`ros2-topics-chevron-${topic.name}`}
                >
                  {canExpand && isExpanded ? '\u25BC' : '\u25B6'}
                </button>
                <input
                  type="checkbox"
                  className="ros2-topics-render-checkbox"
                  data-testid={`ros2-topics-render-${topic.name}`}
                  checked={rowChecked}
                  disabled={rowCheckboxDisabled}
                  onChange={handleRowCheckboxToggle}
                  aria-label={rowCheckboxAriaLabel}
                  title={rowCheckboxTitle}
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
                {isExpanded && (
                  <div
                    className={`ros2-topics-settings${!rowChecked ? ' ros2-topics-settings--inactive' : ''}`}
                  >
                    {isTwistControl ? (
                      !hasTwistVehicles ? (
                        <p className="ros2-topics-settings-hint">
                          No vehicles
                        </p>
                      ) : twistEnabled ? (
                          <div className="ros2-topics-settings-row">
                            <label>Vehicle:</label>
                            <div className="ros2-topics-vehicle-group">
                              <TwistVehicleDropdown
                                topicName={topic.name}
                                vehicles={twistControlVehicles ?? []}
                                selectedVehicleId={twistSelectedVehicleId}
                                onChange={onTwistControlBindingChange}
                              />
                            </div>
                          </div>
                      ) : (
                        <p className="ros2-topics-settings-hint">
                          Enable this topic to select a vehicle.
                        </p>
                      )
                    ) : (
                      <>
                        <div className="ros2-topics-settings-row">
                          <label>Color:</label>
                          <div className="ros2-topics-color-group">
                            <input
                              type="color"
                              className="ros2-topics-color-picker"
                              value={hexValid ? hexValue : visualConfig.color}
                              onChange={(e) => handleColorPicker(e.target.value)}
                            />
                            <input
                              type="text"
                              className={`ros2-topics-color-hex${!hexValid ? ' ros2-topics-color-hex--invalid' : ''}`}
                              value={hexValue}
                              onChange={(e) => handleHexInput(e.target.value)}
                              spellCheck={false}
                            />
                          </div>
                        </div>
                        <div className="ros2-topics-settings-row">
                          <label>Thickness:</label>
                          <div className="ros2-topics-thickness-group">
                            <input
                              type="number"
                              className="ros2-topics-thickness-input"
                              min={0.5}
                              max={10}
                              step={0.5}
                              value={visualConfig.thickness}
                              onChange={(e) => {
                                const raw = Number(e.target.value)
                                if (!Number.isFinite(raw)) return
                                const clamped = Math.min(10, Math.max(0.5, raw))
                                renderable?.setVisualConfig?.(topic.name, {
                                  thickness: clamped,
                                })
                              }}
                              aria-label={`Thickness for ${topic.name}`}
                            />
                          </div>
                        </div>
                        {topic.type === POSE_ARRAY_MESSAGE_TYPE && (
                          <div className="ros2-topics-settings-row">
                            <label>Arrow size (m):</label>
                            <div className="ros2-topics-thickness-group">
                              <input
                                type="number"
                                className="ros2-topics-thickness-input"
                                min={0.1}
                                max={10}
                                step={0.1}
                                value={visualConfig.arrowSize ?? 0.5}
                                onChange={(e) => {
                                  const raw = Number(e.target.value)
                                  if (!Number.isFinite(raw)) return
                                  const clamped = Math.min(10, Math.max(0.1, raw))
                                  renderable?.setVisualConfig?.(topic.name, {
                                    arrowSize: clamped,
                                  })
                                }}
                                aria-label={`Arrow size for ${topic.name}`}
                              />
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
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

/* -- TwistVehicleDropdown -------------------------------------------- */

interface TwistVehicleDropdownProps {
  topicName: string
  vehicles: ReadonlyArray<TwistControlVehicleOption>
  selectedVehicleId: string
  onChange?: (topic: string, vehicleId: string) => void
}

/**
 * Per-row vehicle binding selector for `geometry_msgs/msg/Twist`
 * topics. Lives in this file (not extracted) because it consumes the
 * panel-local props and the visual contract is tightly coupled to the
 * row layout. Disabled with a clear hint when no vehicles or no parent
 * `onChange` callback is supplied — the affordance is still visible so
 * the user knows the slot exists.
 */
function TwistVehicleDropdown({
  topicName,
  vehicles,
  selectedVehicleId,
  onChange,
}: TwistVehicleDropdownProps) {
  const hasVehicles = vehicles.length > 0
  const disabled = !hasVehicles || !onChange
  const title = !hasVehicles
    ? 'No controllable vehicles in this scenario'
    : !onChange
      ? 'Twist control bindings are unavailable'
      : `Vehicle bound to ${topicName}`
  return (
    <select
      className="ros2-topics-twist-vehicle"
      data-testid={`ros2-topics-twist-vehicle-${topicName}`}
      aria-label={`Vehicle bound to ${topicName}`}
      title={title}
      disabled={disabled}
      value={selectedVehicleId}
      onChange={(e) => onChange?.(topicName, e.target.value)}
    >
      {!hasVehicles && (
        <option value={TWIST_DROPDOWN_UNBOUND_VALUE}>
          {TWIST_DROPDOWN_NO_VEHICLES_LABEL}
        </option>
      )}
      {hasVehicles && (
        <option value={TWIST_DROPDOWN_UNBOUND_VALUE}>
          {TWIST_DROPDOWN_UNBOUND_LABEL}
        </option>
      )}
      {vehicles.map((v) => (
        <option key={v.id} value={v.id}>
          {v.label}
        </option>
      ))}
    </select>
  )
}
