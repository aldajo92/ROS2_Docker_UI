import {
  DEFAULT_PATH_VISUAL_CONFIG,
  DEFAULT_POSE_ARRAY_VISUAL_CONFIG,
  type PathVisualConfig,
  type RenderableTopicSelection,
} from '../../app/RenderableTopics'
import type { Ros2TwistTopicBindingState } from '../../app/CommunicationProvider'
import type {
  ScenarioActionSpec,
  ScenarioConnectionsConfig,
  ScenarioDisplaySpec,
  ScenarioSpec,
} from '../../simulation/scenarios/Scenario'
import { parseScenarioJson } from './ScenarioFileLoader'
import { formatScenarioJson } from './ScenarioJsonUtils'

/**
 * App-layer glue between live runtime state and the Scenario Editor JSON.
 *
 * Architectural rules:
 *   - Pure data in / data out — no React, no DOM, no `roslib`.
 *   - Knows about app-side types (`Ros2TwistTopicBindingState`,
 *     `RenderableTopicSelection`) and scenario-side types
 *     (`ScenarioActionSpec`, `ScenarioDisplaySpec`). Both are plain shapes.
 *   - Never mutates the input scenario / selection arrays.
 *   - Merge helpers preserve every unrelated scenario field so editor
 *     auto-rewrites are non-destructive.
 */

const TWIST_MESSAGE_TYPE = 'geometry_msgs/msg/Twist'
const DEFAULT_CONNECTION_ID = 'rosbridge'

/* -- actions ↔ twist bindings ----------------------------------------- */

/**
 * Convert `scenario.actions[]` (JSON schema) to the runtime binding state
 * consumed by `CommunicationProvider`. Only Twist actions with a vehicle
 * target are converted; others are silently skipped (the parser already
 * rejected invalid combinations, so this is a defense-in-depth check).
 */
export function actionsToTwistBindings(
  actions: ReadonlyArray<ScenarioActionSpec>,
): Ros2TwistTopicBindingState[] {
  return actions
    .filter(
      (a) =>
        a.source.messageType === TWIST_MESSAGE_TYPE &&
        a.target?.kind === 'vehicle' &&
        a.target.id.length > 0,
    )
    .map((a): Ros2TwistTopicBindingState => ({
      topic: a.source.topic,
      vehicleId: a.target!.id,
      ...(a.enabled !== undefined && { enabled: a.enabled }),
      ...(a.scale !== undefined && { scale: a.scale }),
      ...(a.limits !== undefined && { limits: a.limits }),
      ...(a.timeoutSec !== undefined && { timeoutSec: a.timeoutSec }),
      ...(a.onTimeout !== undefined && { onTimeout: a.onTimeout }),
    }))
}

/**
 * Convert the live twist binding state back to `scenario.actions[]`
 * (JSON schema). `enabled` is always serialized so the JSON is lossless:
 * a disabled binding appears with `enabled: false` rather than vanishing.
 */
export function twistBindingsToActions(
  bindings: ReadonlyArray<Ros2TwistTopicBindingState>,
  connectionId: string = DEFAULT_CONNECTION_ID,
): ScenarioActionSpec[] {
  return bindings.map((b): ScenarioActionSpec => ({
    source: {
      connection: connectionId,
      topic: b.topic,
      messageType: TWIST_MESSAGE_TYPE,
    },
    target: { kind: 'vehicle', id: b.vehicleId },
    enabled: b.enabled !== false,
    ...(b.scale !== undefined && { scale: b.scale }),
    ...(b.limits !== undefined && { limits: b.limits }),
    ...(b.timeoutSec !== undefined && { timeoutSec: b.timeoutSec }),
    ...(b.onTimeout !== undefined && { onTimeout: b.onTimeout }),
  }))
}

/* -- displays ↔ renderable selections ---------------------------------- */

/**
 * Convert `scenario.displays[]` (JSON schema) to the entries that the
 * `RenderableTopicCapability` apply loop in App.tsx expects. Only entries
 * whose `messageType` is renderable are emitted; others are silently
 * skipped (same defense-in-depth reason as `actionsToTwistBindings`).
 */
export function displaysToRenderableEntries(
  displays: ReadonlyArray<ScenarioDisplaySpec>,
): Array<{
  topicName: string
  messageType: string
  enabled: boolean
  style: { color?: string; thickness?: number; arrowSize?: number }
}> {
  return displays.map((d) => ({
    topicName: d.source.topic,
    messageType: d.source.messageType,
    enabled: d.enabled !== false,
    style: d.style ?? {},
  }))
}

/**
 * Convert the live renderable topic selections to `scenario.displays[]`.
 * Defaults are stripped so the on-disk JSON stays compact.
 */
export function renderableSelectionsToDisplays(
  selections: ReadonlyArray<RenderableTopicSelection>,
  connectionId: string = DEFAULT_CONNECTION_ID,
): ScenarioDisplaySpec[] {
  return selections.map((sel) => buildDisplayEntry(sel, connectionId))
}

function buildDisplayEntry(
  sel: RenderableTopicSelection,
  connectionId: string,
): ScenarioDisplaySpec {
  const style = buildCompactStyle(sel.messageType, sel.visualConfig)
  return {
    source: {
      connection: connectionId,
      topic: sel.topicName,
      messageType: sel.messageType,
    },
    ...(Object.keys(style).length > 0 && { style }),
  }
}

function buildCompactStyle(
  messageType: string,
  config: PathVisualConfig,
): { color?: string; thickness?: number; arrowSize?: number } {
  const defaults =
    messageType === 'geometry_msgs/msg/PoseArray'
      ? DEFAULT_POSE_ARRAY_VISUAL_CONFIG
      : DEFAULT_PATH_VISUAL_CONFIG
  const style: { color?: string; thickness?: number; arrowSize?: number } = {}
  if (config.color !== defaults.color) style.color = config.color
  if (config.thickness !== defaults.thickness) style.thickness = config.thickness
  if (config.arrowSize !== undefined && config.arrowSize !== defaults.arrowSize) {
    style.arrowSize = config.arrowSize
  }
  return style
}

/* -- connections block ------------------------------------------------- */

/**
 * Build the minimal `connections` block for the given connection id.
 * The `url` is included only when explicitly provided.
 */
export function buildConnectionsConfig(
  connectionId: string = DEFAULT_CONNECTION_ID,
  url?: string,
): ScenarioConnectionsConfig {
  return {
    [connectionId]: {
      kind: 'rosbridge',
      ...(url !== undefined && { url }),
    },
  }
}

/* -- scenario merging -------------------------------------------------- */

/**
 * Replace `spec.actions` and ensure `spec.connections` contains the given
 * connection id. All other scenario fields are preserved.
 *
 * When `actions` is empty:
 *   - `actions` is dropped from the spec.
 *   - `connections` is also dropped when no `displays` reference it.
 */
export function mergeActionsIntoScenario(
  spec: ScenarioSpec,
  actions: ReadonlyArray<ScenarioActionSpec>,
  connectionId: string = DEFAULT_CONNECTION_ID,
): ScenarioSpec {
  const next = { ...spec }
  if (actions.length === 0) {
    delete next.actions
    if (!specHasConnection(next, connectionId)) delete next.connections
    return next
  }
  next.actions = [...actions]
  next.connections = {
    ...(next.connections ?? {}),
    [connectionId]: (next.connections?.[connectionId] ?? { kind: 'rosbridge' }),
  }
  return next
}

/**
 * Replace `spec.displays` and ensure `spec.connections` contains the given
 * connection id. All other scenario fields are preserved.
 *
 * When `displays` is empty:
 *   - `displays` is dropped from the spec.
 *   - `connections` is also dropped when no `actions` reference it.
 */
export function mergeDisplaysIntoScenario(
  spec: ScenarioSpec,
  displays: ReadonlyArray<ScenarioDisplaySpec>,
  connectionId: string = DEFAULT_CONNECTION_ID,
): ScenarioSpec {
  const next = { ...spec }
  if (displays.length === 0) {
    delete next.displays
    if (!specHasConnection(next, connectionId)) delete next.connections
    return next
  }
  next.displays = [...displays]
  next.connections = {
    ...(next.connections ?? {}),
    [connectionId]: (next.connections?.[connectionId] ?? { kind: 'rosbridge' }),
  }
  return next
}

function specHasConnection(spec: ScenarioSpec, connectionId: string): boolean {
  const hasInActions = (spec.actions ?? []).some(
    (a) => a.source.connection === connectionId,
  )
  const hasInDisplays = (spec.displays ?? []).some(
    (d) => d.source.connection === connectionId,
  )
  return hasInActions || hasInDisplays
}

/* -- scenario text round-trips ---------------------------------------- */

export type SyncTopicConfigResult =
  | { ok: true; text: string; spec: ScenarioSpec; changed: boolean }
  | { ok: false; reason: string }

/**
 * Best-effort projection of the live Twist bindings into the editor text.
 * Returns `ok: false` when the text is empty or not valid JSON so the
 * caller leaves the textarea alone and does not clobber mid-edit content.
 * `changed` short-circuits React state updates when output equals input.
 */
export function trySyncActionsIntoScenarioText(
  text: string,
  bindings: ReadonlyArray<Ros2TwistTopicBindingState>,
  connectionId: string = DEFAULT_CONNECTION_ID,
): SyncTopicConfigResult {
  if (typeof text !== 'string' || text.length === 0) {
    return { ok: false, reason: 'editor is empty' }
  }
  const parseResult = parseScenarioJson(text)
  if (!parseResult.ok) {
    return { ok: false, reason: parseResult.error }
  }
  const actions = twistBindingsToActions(bindings, connectionId)
  const merged = mergeActionsIntoScenario(parseResult.spec, actions, connectionId)
  const nextText = formatScenarioJson(merged)
  return { ok: true, text: nextText, spec: merged, changed: nextText !== text }
}

/**
 * Best-effort projection of the live renderable topic selections into the
 * editor text. Mirrors `trySyncActionsIntoScenarioText`.
 */
export function trySyncDisplaysIntoScenarioText(
  text: string,
  selections: ReadonlyArray<RenderableTopicSelection>,
  connectionId: string = DEFAULT_CONNECTION_ID,
): SyncTopicConfigResult {
  if (typeof text !== 'string' || text.length === 0) {
    return { ok: false, reason: 'editor is empty' }
  }
  const parseResult = parseScenarioJson(text)
  if (!parseResult.ok) {
    return { ok: false, reason: parseResult.error }
  }
  const displays = renderableSelectionsToDisplays(selections, connectionId)
  const merged = mergeDisplaysIntoScenario(parseResult.spec, displays, connectionId)
  const nextText = formatScenarioJson(merged)
  return { ok: true, text: nextText, spec: merged, changed: nextText !== text }
}
