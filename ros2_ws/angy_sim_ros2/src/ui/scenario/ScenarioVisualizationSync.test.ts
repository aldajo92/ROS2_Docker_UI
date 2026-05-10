import { describe, expect, it } from 'vitest'
import {
  buildRos2TwistControlsFromBindings,
  buildVisualizationFromRenderableSelections,
  mergeRos2TwistControlsIntoScenario,
  mergeVisualizationIntoScenario,
  trySyncRos2TwistControlsIntoScenarioText,
  trySyncVisualizationIntoScenarioText,
} from './ScenarioVisualizationSync'
import {
  DEFAULT_PATH_VISUAL_CONFIG,
  DEFAULT_POSE_ARRAY_VISUAL_CONFIG,
  type RenderableTopicSelection,
} from '../../app/RenderableTopics'
import type { Ros2TwistTopicBindingState } from '../../app/CommunicationProvider'
import type { ScenarioSpec } from '../../simulation/scenarios/Scenario'

const baseScenario: ScenarioSpec = {
  name: 'demo',
  entities: [
    { kind: 'vehicle', id: 'ego', pose: { x: 0, y: 0, yaw: 0 } },
  ],
}

const selection = (
  topic: string,
  messageType: string,
  color = DEFAULT_PATH_VISUAL_CONFIG.color,
  thickness = DEFAULT_PATH_VISUAL_CONFIG.thickness,
  arrowSize?: number,
): RenderableTopicSelection => ({
  topicName: topic,
  messageType,
  kind:
    messageType === 'geometry_msgs/msg/PoseArray'
      ? 'pose_array_2d'
      : 'path2d',
  visualConfig: {
    color,
    thickness,
    ...(arrowSize !== undefined && { arrowSize }),
  },
})

describe('buildVisualizationFromRenderableSelections', () => {
  it('returns an empty object when no topics are selected', () => {
    expect(buildVisualizationFromRenderableSelections([])).toEqual({})
  })

  it('emits topic + messageType for default styling', () => {
    const v = buildVisualizationFromRenderableSelections([
      selection('/circle_path', 'nav_msgs/msg/Path'),
    ])
    expect(v).toEqual({
      ros2Topics: [
        { topic: '/circle_path', messageType: 'nav_msgs/msg/Path' },
      ],
    })
  })

  it('serializes non-default color', () => {
    const v = buildVisualizationFromRenderableSelections([
      selection('/a', 'nav_msgs/msg/Path', '#ffaaff'),
    ])
    expect(v.ros2Topics?.[0].style).toEqual({ color: '#ffaaff' })
  })

  it('serializes non-default thickness', () => {
    const v = buildVisualizationFromRenderableSelections([
      selection(
        '/a',
        'nav_msgs/msg/Path',
        DEFAULT_PATH_VISUAL_CONFIG.color,
        4.5,
      ),
    ])
    expect(v.ros2Topics?.[0].style).toEqual({ thickness: 4.5 })
  })

  it('serializes both color and thickness when both differ from defaults', () => {
    const v = buildVisualizationFromRenderableSelections([
      selection('/a', 'nav_msgs/msg/Path', '#abcdef', 7),
    ])
    expect(v.ros2Topics?.[0].style).toEqual({
      color: '#abcdef',
      thickness: 7,
    })
  })

  it('serializes PoseArray thickness and arrowSize against PoseArray defaults', () => {
    const v = buildVisualizationFromRenderableSelections([
      selection(
        '/pose_array',
        'geometry_msgs/msg/PoseArray',
        DEFAULT_POSE_ARRAY_VISUAL_CONFIG.color,
        1,
        0.8,
      ),
    ])
    expect(v.ros2Topics?.[0]).toEqual({
      topic: '/pose_array',
      messageType: 'geometry_msgs/msg/PoseArray',
      style: {
        thickness: 1,
        arrowSize: 0.8,
      },
    })
  })

  it('omits PoseArray default thickness and arrowSize from style', () => {
    const v = buildVisualizationFromRenderableSelections([
      selection(
        '/pose_array',
        'geometry_msgs/msg/PoseArray',
        DEFAULT_POSE_ARRAY_VISUAL_CONFIG.color,
        DEFAULT_POSE_ARRAY_VISUAL_CONFIG.thickness,
        DEFAULT_POSE_ARRAY_VISUAL_CONFIG.arrowSize,
      ),
    ])
    expect(v.ros2Topics?.[0]).toEqual({
      topic: '/pose_array',
      messageType: 'geometry_msgs/msg/PoseArray',
    })
  })
})

describe('mergeVisualizationIntoScenario', () => {
  it('drops visualization when input is undefined', () => {
    const spec: ScenarioSpec = {
      ...baseScenario,
      visualization: { ros2Topics: [] },
    }
    const merged = mergeVisualizationIntoScenario(spec, undefined)
    expect(merged.visualization).toBeUndefined()
    expect(merged.entities).toBe(spec.entities)
  })

  it('drops visualization when input is an empty object', () => {
    const merged = mergeVisualizationIntoScenario(baseScenario, {})
    expect(merged.visualization).toBeUndefined()
  })

  it('replaces existing visualization with the supplied snapshot', () => {
    const spec: ScenarioSpec = {
      ...baseScenario,
      visualization: { ros2Topics: [{ topic: '/old', messageType: 'x' }] },
    }
    const merged = mergeVisualizationIntoScenario(spec, {
      ros2Topics: [{ topic: '/new', messageType: 'nav_msgs/msg/Path' }],
    })
    expect(merged.visualization).toEqual({
      ros2Topics: [{ topic: '/new', messageType: 'nav_msgs/msg/Path' }],
    })
  })

  it('does not mutate the input spec', () => {
    const spec: ScenarioSpec = {
      ...baseScenario,
      visualization: { ros2Topics: [{ topic: '/old', messageType: 'x' }] },
    }
    const before = JSON.stringify(spec)
    mergeVisualizationIntoScenario(spec, {
      ros2Topics: [{ topic: '/new', messageType: 'nav_msgs/msg/Path' }],
    })
    expect(JSON.stringify(spec)).toBe(before)
  })
})

describe('trySyncVisualizationIntoScenarioText', () => {
  const baseText = JSON.stringify(baseScenario, null, 2)

  it('returns ok: false when the editor text is empty', () => {
    const result = trySyncVisualizationIntoScenarioText('', {
      ros2Topics: [{ topic: '/a', messageType: 'nav_msgs/msg/Path' }],
    })
    expect(result.ok).toBe(false)
  })

  it('returns ok: false when the editor JSON is invalid', () => {
    const result = trySyncVisualizationIntoScenarioText('{ not: json', {
      ros2Topics: [{ topic: '/a', messageType: 'nav_msgs/msg/Path' }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toMatch(/Invalid JSON/)
    }
  })

  it('writes the new visualization block into valid JSON text', () => {
    const result = trySyncVisualizationIntoScenarioText(baseText, {
      ros2Topics: [
        {
          topic: '/circle_path',
          messageType: 'nav_msgs/msg/Path',
          style: { color: '#ffaaff' },
        },
      ],
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.changed).toBe(true)
      const reparsed = JSON.parse(result.text) as ScenarioSpec
      expect(reparsed.visualization?.ros2Topics?.[0]).toEqual({
        topic: '/circle_path',
        messageType: 'nav_msgs/msg/Path',
        style: { color: '#ffaaff' },
      })
    }
  })

  it('reports changed=false when the projected JSON matches the input', () => {
    const withVisualization: ScenarioSpec = {
      ...baseScenario,
      visualization: {
        ros2Topics: [{ topic: '/a', messageType: 'nav_msgs/msg/Path' }],
      },
    }
    const text = JSON.stringify(withVisualization, null, 2)
    const result = trySyncVisualizationIntoScenarioText(text, {
      ros2Topics: [{ topic: '/a', messageType: 'nav_msgs/msg/Path' }],
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.changed).toBe(false)
    }
  })

  it('removes visualization when no topics are selected', () => {
    const withVisualization: ScenarioSpec = {
      ...baseScenario,
      visualization: {
        ros2Topics: [{ topic: '/a', messageType: 'nav_msgs/msg/Path' }],
      },
    }
    const text = JSON.stringify(withVisualization, null, 2)
    const result = trySyncVisualizationIntoScenarioText(text, {})
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.changed).toBe(true)
      const reparsed = JSON.parse(result.text) as ScenarioSpec
      expect(reparsed.visualization).toBeUndefined()
    }
  })

  // Covers the "no scenario loaded yet, user clicks topics, then loads
  // a scenario without its own visualization" path: App.tsx projects
  // current capability selections into the freshly-formatted text so
  // the editor reflects what is rendering. This test simulates that
  // last leg (formatted spec text + selections → merged text).
  it('injects current selections when loading a scenario without visualization', () => {
    const visualization = buildVisualizationFromRenderableSelections([
      selection('/circle_path', 'nav_msgs/msg/Path', '#ffaaff'),
    ])
    const result = trySyncVisualizationIntoScenarioText(baseText, visualization)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.changed).toBe(true)
      const reparsed = JSON.parse(result.text) as ScenarioSpec
      expect(reparsed.visualization?.ros2Topics?.[0]).toEqual({
        topic: '/circle_path',
        messageType: 'nav_msgs/msg/Path',
        style: { color: '#ffaaff' },
      })
    }
  })

  it('syncs PoseArray thickness and arrowSize into scenario editor JSON', () => {
    const visualization = buildVisualizationFromRenderableSelections([
      selection(
        '/pose_array',
        'geometry_msgs/msg/PoseArray',
        '#00bcd4',
        1,
        0.75,
      ),
    ])
    const result = trySyncVisualizationIntoScenarioText(baseText, visualization)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const reparsed = JSON.parse(result.text) as ScenarioSpec
      expect(reparsed.visualization?.ros2Topics?.[0]).toEqual({
        topic: '/pose_array',
        messageType: 'geometry_msgs/msg/PoseArray',
        style: {
          thickness: 1,
          arrowSize: 0.75,
        },
      })
    }
  })
})

const binding = (
  topic: string,
  vehicleId: string,
  enabled: boolean | undefined = true,
  extra: Partial<Ros2TwistTopicBindingState> = {},
): Ros2TwistTopicBindingState => ({
  topic,
  vehicleId,
  ...(enabled !== undefined && { enabled }),
  ...extra,
})

describe('buildRos2TwistControlsFromBindings', () => {
  it('returns an empty array when no bindings are present', () => {
    expect(buildRos2TwistControlsFromBindings([])).toEqual([])
  })

  it('emits an enabled entry with topic + vehicleId for the spec scenario', () => {
    const result = buildRos2TwistControlsFromBindings([
      binding('/cmd_vel', 'ego'),
    ])
    expect(result).toEqual([
      { topic: '/cmd_vel', vehicleId: 'ego', enabled: true },
    ])
  })

  it('preserves enabled: false (lossless)', () => {
    const result = buildRos2TwistControlsFromBindings([
      binding('/cmd_vel', 'ego', false),
    ])
    expect(result).toEqual([
      { topic: '/cmd_vel', vehicleId: 'ego', enabled: false },
    ])
  })

  it('treats undefined enabled as enabled: true', () => {
    // The runtime convention is `enabled !== false ⇒ enabled`. Mirror
    // it so an unspecified flag from older state still serializes as
    // enabled rather than confusing readers with omitted-field semantics.
    const result = buildRos2TwistControlsFromBindings([
      binding('/cmd_vel', 'ego', undefined),
    ])
    expect(result[0].enabled).toBe(true)
  })

  it('only emits scale / limits / timeoutSec / onTimeout when set', () => {
    const result = buildRos2TwistControlsFromBindings([
      binding('/cmd_vel', 'ego', true, {
        scale: { v: 0.5 },
        limits: { maxForwardSpeed: 1.0 },
        timeoutSec: 0.5,
        onTimeout: 'stop',
      }),
    ])
    expect(result).toEqual([
      {
        topic: '/cmd_vel',
        vehicleId: 'ego',
        enabled: true,
        scale: { v: 0.5 },
        limits: { maxForwardSpeed: 1.0 },
        timeoutSec: 0.5,
        onTimeout: 'stop',
      },
    ])
  })
})

describe('mergeRos2TwistControlsIntoScenario', () => {
  it('drops interaction when bindings are empty and spec had no interaction', () => {
    const merged = mergeRos2TwistControlsIntoScenario(baseScenario, [])
    expect(merged.interaction).toBeUndefined()
  })

  it('adds interaction.ros2TwistControls when spec had no interaction', () => {
    const merged = mergeRos2TwistControlsIntoScenario(baseScenario, [
      { topic: '/cmd_vel', vehicleId: 'ego', enabled: true },
    ])
    expect(merged.interaction).toEqual({
      ros2TwistControls: [
        { topic: '/cmd_vel', vehicleId: 'ego', enabled: true },
      ],
    })
  })

  it('preserves sibling fields like keyboardControl when adding ros2TwistControls', () => {
    const spec: ScenarioSpec = {
      ...baseScenario,
      interaction: {
        keyboardControl: { vehicleId: 'ego', forwardSpeed: 0.5, angularSpeed: 0.4 },
      },
    }
    const merged = mergeRos2TwistControlsIntoScenario(spec, [
      { topic: '/cmd_vel', vehicleId: 'ego', enabled: true },
    ])
    expect(merged.interaction).toEqual({
      keyboardControl: { vehicleId: 'ego', forwardSpeed: 0.5, angularSpeed: 0.4 },
      ros2TwistControls: [
        { topic: '/cmd_vel', vehicleId: 'ego', enabled: true },
      ],
    })
  })

  it('drops only ros2TwistControls when bindings empty but keyboardControl exists', () => {
    const spec: ScenarioSpec = {
      ...baseScenario,
      interaction: {
        keyboardControl: { vehicleId: 'ego', forwardSpeed: 0.5, angularSpeed: 0.4 },
        ros2TwistControls: [
          { topic: '/cmd_vel', vehicleId: 'ego', enabled: true },
        ],
      },
    }
    const merged = mergeRos2TwistControlsIntoScenario(spec, [])
    expect(merged.interaction).toEqual({
      keyboardControl: { vehicleId: 'ego', forwardSpeed: 0.5, angularSpeed: 0.4 },
    })
  })

  it('drops the whole interaction block when its only field becomes empty', () => {
    const spec: ScenarioSpec = {
      ...baseScenario,
      interaction: {
        ros2TwistControls: [
          { topic: '/cmd_vel', vehicleId: 'ego', enabled: true },
        ],
      },
    }
    const merged = mergeRos2TwistControlsIntoScenario(spec, [])
    expect(merged.interaction).toBeUndefined()
  })

  it('does not mutate the input spec', () => {
    const spec: ScenarioSpec = {
      ...baseScenario,
      interaction: {
        ros2TwistControls: [
          { topic: '/old', vehicleId: 'ego', enabled: true },
        ],
      },
    }
    const before = JSON.stringify(spec)
    mergeRos2TwistControlsIntoScenario(spec, [
      { topic: '/new', vehicleId: 'ego', enabled: true },
    ])
    expect(JSON.stringify(spec)).toBe(before)
  })
})

describe('trySyncRos2TwistControlsIntoScenarioText', () => {
  const baseText = JSON.stringify(baseScenario, null, 2)

  it('returns ok: false when the editor text is empty', () => {
    const result = trySyncRos2TwistControlsIntoScenarioText('', [
      { topic: '/cmd_vel', vehicleId: 'ego', enabled: true },
    ])
    expect(result.ok).toBe(false)
  })

  it('returns ok: false when the editor JSON is invalid', () => {
    const result = trySyncRos2TwistControlsIntoScenarioText('{ not: json', [
      { topic: '/cmd_vel', vehicleId: 'ego', enabled: true },
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toMatch(/Invalid JSON/)
    }
  })

  // The acceptance scenario from the feature spec: selecting /cmd_vel
  // for vehicle "ego" must show up under interaction.ros2TwistControls
  // with vehicleId "ego" and enabled.
  it('writes a /cmd_vel → ego entry into valid JSON text (S1)', () => {
    const ros2TwistControls = buildRos2TwistControlsFromBindings([
      binding('/cmd_vel', 'ego'),
    ])
    const result = trySyncRos2TwistControlsIntoScenarioText(
      baseText,
      ros2TwistControls,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.changed).toBe(true)
      const reparsed = JSON.parse(result.text) as ScenarioSpec
      expect(reparsed.interaction?.ros2TwistControls).toEqual([
        { topic: '/cmd_vel', vehicleId: 'ego', enabled: true },
      ])
    }
  })

  it('reports changed=false when the projected JSON matches the input', () => {
    const withBinding: ScenarioSpec = {
      ...baseScenario,
      interaction: {
        ros2TwistControls: [
          { topic: '/cmd_vel', vehicleId: 'ego', enabled: true },
        ],
      },
    }
    const text = JSON.stringify(withBinding, null, 2)
    const result = trySyncRos2TwistControlsIntoScenarioText(text, [
      { topic: '/cmd_vel', vehicleId: 'ego', enabled: true },
    ])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.changed).toBe(false)
    }
  })

  it('removes ros2TwistControls when no bindings remain', () => {
    const withBinding: ScenarioSpec = {
      ...baseScenario,
      interaction: {
        ros2TwistControls: [
          { topic: '/cmd_vel', vehicleId: 'ego', enabled: true },
        ],
      },
    }
    const text = JSON.stringify(withBinding, null, 2)
    const result = trySyncRos2TwistControlsIntoScenarioText(text, [])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.changed).toBe(true)
      const reparsed = JSON.parse(result.text) as ScenarioSpec
      expect(reparsed.interaction).toBeUndefined()
    }
  })

  it('preserves keyboardControl when toggling Twist bindings', () => {
    const withBoth: ScenarioSpec = {
      ...baseScenario,
      interaction: {
        keyboardControl: { vehicleId: 'ego', forwardSpeed: 0.5, angularSpeed: 0.4 },
      },
    }
    const text = JSON.stringify(withBoth, null, 2)
    const result = trySyncRos2TwistControlsIntoScenarioText(text, [
      { topic: '/cmd_vel', vehicleId: 'ego', enabled: true },
    ])
    expect(result.ok).toBe(true)
    if (result.ok) {
      const reparsed = JSON.parse(result.text) as ScenarioSpec
      expect(reparsed.interaction?.keyboardControl).toEqual({
        vehicleId: 'ego',
        forwardSpeed: 0.5,
        angularSpeed: 0.4,
      })
      expect(reparsed.interaction?.ros2TwistControls).toEqual([
        { topic: '/cmd_vel', vehicleId: 'ego', enabled: true },
      ])
    }
  })

  // S2 from the feature spec: rosbridge transport alone must NOT add
  // entries to either visualization.ros2Topics or interaction.ros2TwistControls.
  // This sync helper is what would be wired to topic selection — verify
  // that with empty bindings (the state when only the transport changes)
  // it produces no entries.
  it('does not add interaction when bindings are empty (S2)', () => {
    const result = trySyncRos2TwistControlsIntoScenarioText(baseText, [])
    expect(result.ok).toBe(true)
    if (result.ok) {
      const reparsed = JSON.parse(result.text) as ScenarioSpec
      expect(reparsed.interaction).toBeUndefined()
    }
  })

  it('persists enabled: false when a binding is toggled off', () => {
    const ros2TwistControls = buildRos2TwistControlsFromBindings([
      binding('/cmd_vel', 'ego', false),
    ])
    const result = trySyncRos2TwistControlsIntoScenarioText(
      baseText,
      ros2TwistControls,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      const reparsed = JSON.parse(result.text) as ScenarioSpec
      expect(reparsed.interaction?.ros2TwistControls).toEqual([
        { topic: '/cmd_vel', vehicleId: 'ego', enabled: false },
      ])
    }
  })
})
