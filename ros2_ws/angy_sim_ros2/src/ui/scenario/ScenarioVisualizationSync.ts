import {
  DEFAULT_PATH_VISUAL_CONFIG,
  DEFAULT_POSE_ARRAY_VISUAL_CONFIG,
  type PathVisualConfig,
  type RenderableTopicSelection,
} from '../../app/RenderableTopics'
import type {
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
