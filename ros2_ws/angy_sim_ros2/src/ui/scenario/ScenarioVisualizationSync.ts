import {
  DEFAULT_PATH_VISUAL_CONFIG,
  DEFAULT_POSE_ARRAY_VISUAL_CONFIG,
  type PathVisualConfig,
  type RenderableTopicSelection,
} from '../../app/RenderableTopics'
import type { Ros2TwistTopicBindingState } from '../../app/CommunicationProvider'
import type {
  Ros2TwistControlBinding,
  ScenarioInteractionConfig,
  ScenarioSpec,
  ScenarioVisualizationConfig,
  ScenarioVisualizationRos2Topic,
  ScenarioVisualizationTopicStyle,
} from '../../simulation/scenarios/Scenario'
import { parseScenarioJson } from './ScenarioFileLoader'
import { formatScenarioJson } from './ScenarioJsonUtils'

/**
 * App-layer glue between the live `RenderableTopicCapability` (the
 * source of truth for what is currently rendering) and the Scenario
 * Editor JSON (a *projection* the user can persist / share / re-load).
 *
 * Architectural rules:
 *   - Pure data in / data out — no React, no DOM, no `roslib`.
 *   - Knows about app-side `RenderableTopicSelection` and scenario-side
 *     `ScenarioVisualizationConfig`. Both are plain shapes.
 *   - Never mutates the input scenario / selection arrays.
 *   - The merge keeps every other scenario field untouched so editor
 *     auto-rewrites are non-destructive.
 *
 * `App.tsx` calls these helpers each time the renderable selection
 * changes, then re-projects the result into the editor textarea.
 */

/* -- selection → scenario projection ---------------------------------- */

/**
 * Project the current renderable selections into the
 * `visualization.ros2Topics` shape carried by `ScenarioSpec`.
 *
 * Defaults are stripped so the on-disk JSON stays compact: the default
 * color/thickness from `DEFAULT_PATH_VISUAL_CONFIG` is omitted and
 * `enabled: true` is omitted (it's the default). A topic with no
 * non-default fields still emits `{ topic, messageType, enabled: true }`
 * because dropping it entirely would imply "not selected".
 */
export function buildVisualizationFromRenderableSelections(
  selections: ReadonlyArray<RenderableTopicSelection>,
): ScenarioVisualizationConfig {
  const ros2Topics = selections.map((sel) =>
    buildVisualizationEntry(sel.topicName, sel.messageType, sel.visualConfig),
  )
  return ros2Topics.length === 0 ? {} : { ros2Topics }
}

function buildVisualizationEntry(
  topic: string,
  messageType: string,
  config: PathVisualConfig,
): ScenarioVisualizationRos2Topic {
  const style: ScenarioVisualizationTopicStyle = {}
  const defaults =
    messageType === 'geometry_msgs/msg/PoseArray'
      ? DEFAULT_POSE_ARRAY_VISUAL_CONFIG
      : DEFAULT_PATH_VISUAL_CONFIG
  if (config.color !== defaults.color) {
    style.color = config.color
  }
  if (config.thickness !== defaults.thickness) {
    style.thickness = config.thickness
  }
  if (
    config.arrowSize !== undefined &&
    config.arrowSize !== defaults.arrowSize
  ) {
    style.arrowSize = config.arrowSize
  }
  const entry: ScenarioVisualizationRos2Topic = { topic, messageType }
  if (Object.keys(style).length > 0) entry.style = style
  return entry
}

/* -- scenario merging -------------------------------------------------- */

/**
 * Replace `spec.visualization` with the supplied snapshot. All other
 * scenario fields are preserved by-reference. When `visualization` is
 * `undefined` (or empty without ros2Topics), the field is dropped from
 * the resulting spec so the JSON stays minimal.
 */
export function mergeVisualizationIntoScenario(
  spec: ScenarioSpec,
  visualization: ScenarioVisualizationConfig | undefined,
): ScenarioSpec {
  const next = { ...spec }
  if (
    visualization === undefined ||
    (visualization.ros2Topics === undefined &&
      Object.keys(visualization).length === 0)
  ) {
    delete next.visualization
    return next
  }
  next.visualization = visualization
  return next
}

/* -- scenario text round-trip ----------------------------------------- */

export type SyncVisualizationResult =
  | { ok: true; text: string; spec: ScenarioSpec; changed: boolean }
  | { ok: false; reason: string }

/**
 * Best-effort projection of `visualization` into the editor text. The
 * caller hands in the user's current textarea content; we parse it
 * (using the same loader used by Apply), merge the new visualization,
 * and return a re-serialized text that callers can write back. When
 * the user is mid-edit and the text isn't valid JSON yet, we return
 * `{ ok: false }` and the caller leaves the textarea alone — that's
 * the contract that keeps auto-sync from clobbering manual edits.
 *
 * `changed` reports whether the produced `text` differs from the
 * supplied one. The caller uses this to short-circuit React state
 * updates and avoid re-render / re-sync feedback loops.
 */
export function trySyncVisualizationIntoScenarioText(
  text: string,
  visualization: ScenarioVisualizationConfig | undefined,
): SyncVisualizationResult {
  if (typeof text !== 'string' || text.length === 0) {
    return { ok: false, reason: 'editor is empty' }
  }
  const parseResult = parseScenarioJson(text)
  if (!parseResult.ok) {
    return { ok: false, reason: parseResult.error }
  }
  const merged = mergeVisualizationIntoScenario(parseResult.spec, visualization)
  const nextText = formatScenarioJson(merged)
  return {
    ok: true,
    text: nextText,
    spec: merged,
    changed: nextText !== text,
  }
}

/* -- Twist control bindings → scenario projection --------------------- */

/**
 * Project the live `twistControlBindings` array (React shell state)
 * into the JSON-safe `Ros2TwistControlBinding[]` shape carried by
 * `ScenarioSpec.interaction.ros2TwistControls`.
 *
 * `enabled` is *always* serialized (true or false) so the resulting
 * JSON is lossless: a user who toggles a binding off in the UI sees
 * the entry persist with `enabled: false` rather than silently
 * disappearing. `scale`, `limits`, `timeoutSec`, and `onTimeout` are
 * only emitted when explicitly set.
 */
export function buildRos2TwistControlsFromBindings(
  bindings: ReadonlyArray<Ros2TwistTopicBindingState>,
): Ros2TwistControlBinding[] {
  return bindings.map(buildRos2TwistControlEntry)
}

function buildRos2TwistControlEntry(
  binding: Ros2TwistTopicBindingState,
): Ros2TwistControlBinding {
  return {
    topic: binding.topic,
    vehicleId: binding.vehicleId,
    enabled: binding.enabled !== false,
    ...(binding.scale !== undefined && { scale: binding.scale }),
    ...(binding.limits !== undefined && { limits: binding.limits }),
    ...(binding.timeoutSec !== undefined && { timeoutSec: binding.timeoutSec }),
    ...(binding.onTimeout !== undefined && { onTimeout: binding.onTimeout }),
  }
}

/* -- Twist control scenario merging ----------------------------------- */

/**
 * Replace `spec.interaction.ros2TwistControls` with the supplied
 * snapshot while preserving every sibling field of `interaction`
 * (notably `keyboardControl`). When the supplied list is empty, the
 * `ros2TwistControls` field is dropped; if `interaction` then has no
 * remaining fields, the whole `interaction` block is dropped from
 * the spec. The input spec is never mutated.
 */
export function mergeRos2TwistControlsIntoScenario(
  spec: ScenarioSpec,
  ros2TwistControls: ReadonlyArray<Ros2TwistControlBinding>,
): ScenarioSpec {
  const next = { ...spec }
  const existingInteraction: ScenarioInteractionConfig = next.interaction ?? {}
  const nextInteraction: ScenarioInteractionConfig = { ...existingInteraction }
  if (ros2TwistControls.length === 0) {
    delete nextInteraction.ros2TwistControls
  } else {
    nextInteraction.ros2TwistControls = [...ros2TwistControls]
  }
  if (Object.keys(nextInteraction).length === 0) {
    delete next.interaction
  } else {
    next.interaction = nextInteraction
  }
  return next
}

/* -- Twist control scenario text round-trip --------------------------- */

export type SyncRos2TwistControlsResult =
  | { ok: true; text: string; spec: ScenarioSpec; changed: boolean }
  | { ok: false; reason: string }

/**
 * Best-effort projection of the live Twist control bindings into the
 * editor text. Mirrors {@link trySyncVisualizationIntoScenarioText}:
 * we parse the user's current textarea, replace only
 * `interaction.ros2TwistControls`, and return the re-serialized text.
 * When the text is empty or invalid JSON we return `ok: false` so the
 * caller leaves the textarea alone — the same contract that keeps
 * auto-sync from clobbering manual edits.
 */
export function trySyncRos2TwistControlsIntoScenarioText(
  text: string,
  ros2TwistControls: ReadonlyArray<Ros2TwistControlBinding>,
): SyncRos2TwistControlsResult {
  if (typeof text !== 'string' || text.length === 0) {
    return { ok: false, reason: 'editor is empty' }
  }
  const parseResult = parseScenarioJson(text)
  if (!parseResult.ok) {
    return { ok: false, reason: parseResult.error }
  }
  const merged = mergeRos2TwistControlsIntoScenario(
    parseResult.spec,
    ros2TwistControls,
  )
  const nextText = formatScenarioJson(merged)
  return {
    ok: true,
    text: nextText,
    spec: merged,
    changed: nextText !== text,
  }
}
