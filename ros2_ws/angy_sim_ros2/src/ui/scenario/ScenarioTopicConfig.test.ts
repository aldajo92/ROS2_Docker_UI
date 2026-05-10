import { describe, expect, it } from 'vitest'
import {
  actionsToTwistBindings,
  buildConnectionsConfig,
  displaysToRenderableEntries,
  mergeActionsIntoScenario,
  mergeDisplaysIntoScenario,
  renderableSelectionsToDisplays,
  trySyncActionsIntoScenarioText,
  trySyncDisplaysIntoScenarioText,
  twistBindingsToActions,
} from './ScenarioTopicConfig'
import {
  DEFAULT_PATH_VISUAL_CONFIG,
  DEFAULT_POSE_ARRAY_VISUAL_CONFIG,
  type RenderableTopicSelection,
} from '../../app/RenderableTopics'
import type { Ros2TwistTopicBindingState } from '../../app/CommunicationProvider'
import type { ScenarioSpec } from '../../simulation/scenarios/Scenario'

const baseScenario: ScenarioSpec = {
  name: 'demo',
  entities: [{ kind: 'vehicle', id: 'ego', pose: { x: 0, y: 0, yaw: 0 } }],
}

const conn = { rosbridge: { kind: 'rosbridge' as const } }

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
    messageType === 'geometry_msgs/msg/PoseArray' ? 'pose_array_2d' : 'path2d',
  visualConfig: {
    color,
    thickness,
    ...(arrowSize !== undefined && { arrowSize }),
  },
})

const binding = (
  topic: string,
  vehicleId: string,
  enabled?: boolean,
  extra?: Partial<Ros2TwistTopicBindingState>,
): Ros2TwistTopicBindingState => ({
  topic,
  vehicleId,
  ...(enabled !== undefined && { enabled }),
  ...extra,
})

/* -- actionsToTwistBindings -------------------------------------------- */

describe('actionsToTwistBindings', () => {
  it('returns empty array for empty input', () => {
    expect(actionsToTwistBindings([])).toEqual([])
  })

  it('converts a full Twist action to binding state', () => {
    const result = actionsToTwistBindings([
      {
        source: {
          connection: 'rosbridge',
          topic: '/cmd_vel',
          messageType: 'geometry_msgs/msg/Twist',
        },
        target: { kind: 'vehicle', id: 'ego' },
        enabled: true,
        scale: { v: 0.5, w: 1.5 },
        limits: { maxForwardSpeed: 2.0, maxAngularSpeed: 2.5 },
        timeoutSec: 0.5,
        onTimeout: 'stop',
      },
    ])
    expect(result).toEqual([
      {
        topic: '/cmd_vel',
        vehicleId: 'ego',
        enabled: true,
        scale: { v: 0.5, w: 1.5 },
        limits: { maxForwardSpeed: 2.0, maxAngularSpeed: 2.5 },
        timeoutSec: 0.5,
        onTimeout: 'stop',
      },
    ])
  })

  it('preserves enabled: false', () => {
    const result = actionsToTwistBindings([
      {
        source: {
          connection: 'rosbridge',
          topic: '/cmd_vel',
          messageType: 'geometry_msgs/msg/Twist',
        },
        target: { kind: 'vehicle', id: 'ego' },
        enabled: false,
      },
    ])
    expect(result[0].enabled).toBe(false)
  })

  it('omits optional fields when not set', () => {
    const result = actionsToTwistBindings([
      {
        source: {
          connection: 'rosbridge',
          topic: '/cmd_vel',
          messageType: 'geometry_msgs/msg/Twist',
        },
        target: { kind: 'vehicle', id: 'ego' },
      },
    ])
    expect(result[0].scale).toBeUndefined()
    expect(result[0].limits).toBeUndefined()
    expect(result[0].enabled).toBeUndefined()
  })
})

/* -- twistBindingsToActions -------------------------------------------- */

describe('twistBindingsToActions', () => {
  it('returns empty array for empty input', () => {
    expect(twistBindingsToActions([])).toEqual([])
  })

  it('produces correct source fields', () => {
    const result = twistBindingsToActions(
      [binding('/cmd_vel', 'ego', true)],
      'rosbridge',
    )
    expect(result[0].source).toEqual({
      connection: 'rosbridge',
      topic: '/cmd_vel',
      messageType: 'geometry_msgs/msg/Twist',
    })
  })

  it('produces correct target', () => {
    const result = twistBindingsToActions([binding('/cmd_vel', 'ego')])
    expect(result[0].target).toEqual({ kind: 'vehicle', id: 'ego' })
  })

  it('always serializes enabled', () => {
    const withTrue = twistBindingsToActions([binding('/t', 'ego', true)])
    expect(withTrue[0].enabled).toBe(true)
    const withFalse = twistBindingsToActions([binding('/t', 'ego', false)])
    expect(withFalse[0].enabled).toBe(false)
    const withUndef = twistBindingsToActions([binding('/t', 'ego')])
    expect(withUndef[0].enabled).toBe(true)
  })

  it('emits optional fields only when set', () => {
    const result = twistBindingsToActions([
      binding('/t', 'ego', true, {
        scale: { v: 0.5 },
        limits: { maxForwardSpeed: 2.0 },
      }),
    ])
    expect(result[0].scale).toEqual({ v: 0.5 })
    expect(result[0].limits).toEqual({ maxForwardSpeed: 2.0 })
    const plain = twistBindingsToActions([binding('/t', 'ego')])
    expect(plain[0].scale).toBeUndefined()
  })

  it('uses the provided connectionId', () => {
    const result = twistBindingsToActions([binding('/t', 'ego')], 'myConn')
    expect(result[0].source.connection).toBe('myConn')
  })
})

/* -- displaysToRenderableEntries --------------------------------------- */

describe('displaysToRenderableEntries', () => {
  it('returns empty array for empty input', () => {
    expect(displaysToRenderableEntries([])).toEqual([])
  })

  it('converts a Path display to a renderable entry', () => {
    const result = displaysToRenderableEntries([
      {
        source: {
          connection: 'rosbridge',
          topic: '/circle_path',
          messageType: 'nav_msgs/msg/Path',
        },
        enabled: true,
        style: { color: '#ffaaff', thickness: 3 },
      },
    ])
    expect(result[0]).toEqual({
      topicName: '/circle_path',
      messageType: 'nav_msgs/msg/Path',
      enabled: true,
      style: { color: '#ffaaff', thickness: 3 },
    })
  })

  it('defaults enabled to true when not set', () => {
    const result = displaysToRenderableEntries([
      {
        source: { connection: 'rosbridge', topic: '/a', messageType: 'nav_msgs/msg/Path' },
      },
    ])
    expect(result[0].enabled).toBe(true)
  })

  it('preserves enabled: false', () => {
    const result = displaysToRenderableEntries([
      {
        source: { connection: 'rosbridge', topic: '/a', messageType: 'nav_msgs/msg/Path' },
        enabled: false,
      },
    ])
    expect(result[0].enabled).toBe(false)
  })

  it('returns empty style object when style is not provided', () => {
    const result = displaysToRenderableEntries([
      {
        source: { connection: 'rosbridge', topic: '/a', messageType: 'nav_msgs/msg/Path' },
      },
    ])
    expect(result[0].style).toEqual({})
  })
})

/* -- renderableSelectionsToDisplays ------------------------------------ */

describe('renderableSelectionsToDisplays', () => {
  it('returns empty array for no selections', () => {
    expect(renderableSelectionsToDisplays([])).toEqual([])
  })

  it('produces source with connection, topic, messageType for Path', () => {
    const result = renderableSelectionsToDisplays(
      [selection('/circle_path', 'nav_msgs/msg/Path')],
      'rosbridge',
    )
    expect(result[0].source).toEqual({
      connection: 'rosbridge',
      topic: '/circle_path',
      messageType: 'nav_msgs/msg/Path',
    })
  })

  it('omits style when all fields match defaults (Path)', () => {
    const result = renderableSelectionsToDisplays([
      selection('/a', 'nav_msgs/msg/Path'),
    ])
    expect(result[0].style).toBeUndefined()
  })

  it('includes style when color differs from default', () => {
    const result = renderableSelectionsToDisplays([
      selection('/a', 'nav_msgs/msg/Path', '#ffaaff'),
    ])
    expect(result[0].style?.color).toBe('#ffaaff')
  })

  it('includes style when thickness differs from default', () => {
    const result = renderableSelectionsToDisplays([
      selection('/a', 'nav_msgs/msg/Path', DEFAULT_PATH_VISUAL_CONFIG.color, 5),
    ])
    expect(result[0].style?.thickness).toBe(5)
  })

  it('includes arrowSize for PoseArray when it differs from default', () => {
    const result = renderableSelectionsToDisplays([
      selection(
        '/poses',
        'geometry_msgs/msg/PoseArray',
        DEFAULT_POSE_ARRAY_VISUAL_CONFIG.color,
        DEFAULT_POSE_ARRAY_VISUAL_CONFIG.thickness,
        1.0,
      ),
    ])
    expect(result[0].style?.arrowSize).toBe(1.0)
  })

  it('omits style entirely for PoseArray with all defaults', () => {
    const result = renderableSelectionsToDisplays([
      selection(
        '/poses',
        'geometry_msgs/msg/PoseArray',
        DEFAULT_POSE_ARRAY_VISUAL_CONFIG.color,
        DEFAULT_POSE_ARRAY_VISUAL_CONFIG.thickness,
        DEFAULT_POSE_ARRAY_VISUAL_CONFIG.arrowSize,
      ),
    ])
    expect(result[0].style).toBeUndefined()
  })
})

/* -- buildConnectionsConfig ------------------------------------------- */

describe('buildConnectionsConfig', () => {
  it('returns a rosbridge entry without url when none provided', () => {
    expect(buildConnectionsConfig('rosbridge')).toEqual({
      rosbridge: { kind: 'rosbridge' },
    })
  })

  it('includes url when provided', () => {
    expect(buildConnectionsConfig('rosbridge', 'ws://localhost:9090')).toEqual({
      rosbridge: { kind: 'rosbridge', url: 'ws://localhost:9090' },
    })
  })
})

/* -- mergeActionsIntoScenario ----------------------------------------- */

describe('mergeActionsIntoScenario', () => {
  it('drops actions and connections when actions array is empty', () => {
    const result = mergeActionsIntoScenario(baseScenario, [])
    expect(result.actions).toBeUndefined()
    expect(result.connections).toBeUndefined()
  })

  it('adds actions and connections when there are bindings', () => {
    const actions = twistBindingsToActions([binding('/cmd_vel', 'ego', true)])
    const result = mergeActionsIntoScenario(baseScenario, actions)
    expect(result.actions).toHaveLength(1)
    expect(result.connections?.rosbridge).toEqual({ kind: 'rosbridge' })
  })

  it('preserves existing connection url when already set', () => {
    const specWithConn: ScenarioSpec = {
      ...baseScenario,
      connections: { rosbridge: { kind: 'rosbridge', url: 'ws://localhost:9090' } },
    }
    const actions = twistBindingsToActions([binding('/cmd_vel', 'ego', true)])
    const result = mergeActionsIntoScenario(specWithConn, actions)
    expect(result.connections?.rosbridge.url).toBe('ws://localhost:9090')
  })

  it('preserves sibling scenario fields', () => {
    const actions = twistBindingsToActions([binding('/cmd_vel', 'ego', true)])
    const result = mergeActionsIntoScenario(
      { ...baseScenario, interaction: { keyboardControl: { enabled: true } } },
      actions,
    )
    expect(result.interaction?.keyboardControl?.enabled).toBe(true)
  })

  it('does not mutate the input spec', () => {
    const input = { ...baseScenario }
    mergeActionsIntoScenario(input, twistBindingsToActions([binding('/t', 'ego')]))
    expect(input.actions).toBeUndefined()
  })

  it('drops connections when emptying actions and no displays reference it', () => {
    const specWithBoth: ScenarioSpec = {
      ...baseScenario,
      connections: conn,
      actions: [
        {
          source: { connection: 'rosbridge', topic: '/t', messageType: 'geometry_msgs/msg/Twist' },
          target: { kind: 'vehicle', id: 'ego' },
        },
      ],
    }
    const result = mergeActionsIntoScenario(specWithBoth, [])
    expect(result.actions).toBeUndefined()
    expect(result.connections).toBeUndefined()
  })

  it('keeps connections when displays still reference it after clearing actions', () => {
    const specWithDisplays: ScenarioSpec = {
      ...baseScenario,
      connections: conn,
      displays: [
        {
          source: { connection: 'rosbridge', topic: '/path', messageType: 'nav_msgs/msg/Path' },
        },
      ],
    }
    const result = mergeActionsIntoScenario(specWithDisplays, [])
    expect(result.connections).toEqual(conn)
  })
})

/* -- mergeDisplaysIntoScenario ---------------------------------------- */

describe('mergeDisplaysIntoScenario', () => {
  it('drops displays and connections when displays array is empty', () => {
    const result = mergeDisplaysIntoScenario(baseScenario, [])
    expect(result.displays).toBeUndefined()
    expect(result.connections).toBeUndefined()
  })

  it('adds displays and connections when there are selections', () => {
    const displays = renderableSelectionsToDisplays(
      [selection('/circle_path', 'nav_msgs/msg/Path')],
    )
    const result = mergeDisplaysIntoScenario(baseScenario, displays)
    expect(result.displays).toHaveLength(1)
    expect(result.connections?.rosbridge).toEqual({ kind: 'rosbridge' })
  })

  it('preserves sibling fields', () => {
    const displays = renderableSelectionsToDisplays(
      [selection('/a', 'nav_msgs/msg/Path')],
    )
    const result = mergeDisplaysIntoScenario(
      { ...baseScenario, interaction: { keyboardControl: { enabled: true } } },
      displays,
    )
    expect(result.interaction?.keyboardControl?.enabled).toBe(true)
  })

  it('does not mutate the input spec', () => {
    const input = { ...baseScenario }
    mergeDisplaysIntoScenario(
      input,
      renderableSelectionsToDisplays([selection('/a', 'nav_msgs/msg/Path')]),
    )
    expect(input.displays).toBeUndefined()
  })

  it('keeps connections when actions still reference it after clearing displays', () => {
    const specWithActions: ScenarioSpec = {
      ...baseScenario,
      connections: conn,
      actions: [
        {
          source: { connection: 'rosbridge', topic: '/t', messageType: 'geometry_msgs/msg/Twist' },
          target: { kind: 'vehicle', id: 'ego' },
        },
      ],
    }
    const result = mergeDisplaysIntoScenario(specWithActions, [])
    expect(result.connections).toEqual(conn)
  })
})

/* -- trySyncActionsIntoScenarioText ------------------------------------ */

describe('trySyncActionsIntoScenarioText', () => {
  it('returns ok: false for empty text', () => {
    expect(trySyncActionsIntoScenarioText('', [])).toEqual({
      ok: false,
      reason: 'editor is empty',
    })
  })

  it('returns ok: false for invalid JSON', () => {
    const result = trySyncActionsIntoScenarioText('{invalid}', [])
    expect(result.ok).toBe(false)
  })

  it('writes a /cmd_vel → ego entry', () => {
    const text = JSON.stringify(baseScenario, null, 2)
    const result = trySyncActionsIntoScenarioText(
      text,
      [binding('/cmd_vel', 'ego', true)],
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      const parsed = JSON.parse(result.text)
      expect(parsed.actions).toHaveLength(1)
      expect(parsed.actions[0].source.topic).toBe('/cmd_vel')
      expect(parsed.actions[0].target.id).toBe('ego')
      expect(parsed.connections?.rosbridge).toEqual({ kind: 'rosbridge' })
    }
  })

  it('reports changed: true when text changes', () => {
    const text = JSON.stringify(baseScenario, null, 2)
    const result = trySyncActionsIntoScenarioText(text, [binding('/t', 'ego')])
    expect(result.ok && result.changed).toBe(true)
  })

  it('reports changed: false when text is already up to date', () => {
    const text = JSON.stringify(baseScenario, null, 2)
    const result1 = trySyncActionsIntoScenarioText(text, [])
    expect(result1.ok && !result1.changed).toBe(true)
  })

  it('removes actions when bindings are empty', () => {
    const specWithActions: ScenarioSpec = {
      ...baseScenario,
      connections: conn,
      actions: [
        {
          source: { connection: 'rosbridge', topic: '/t', messageType: 'geometry_msgs/msg/Twist' },
          target: { kind: 'vehicle', id: 'ego' },
          enabled: true,
        },
      ],
    }
    const text = JSON.stringify(specWithActions, null, 2)
    const result = trySyncActionsIntoScenarioText(text, [])
    expect(result.ok).toBe(true)
    if (result.ok) {
      const parsed = JSON.parse(result.text)
      expect(parsed.actions).toBeUndefined()
      expect(parsed.connections).toBeUndefined()
    }
  })

  it('preserves sibling scenario fields', () => {
    const spec: ScenarioSpec = {
      ...baseScenario,
      interaction: { keyboardControl: { enabled: true } },
    }
    const text = JSON.stringify(spec, null, 2)
    const result = trySyncActionsIntoScenarioText(text, [binding('/t', 'ego')])
    expect(result.ok).toBe(true)
    if (result.ok) {
      const parsed = JSON.parse(result.text)
      expect(parsed.interaction?.keyboardControl?.enabled).toBe(true)
    }
  })

  it('does NOT write actions when only a transport is selected (no bindings)', () => {
    const text = JSON.stringify(baseScenario, null, 2)
    const result = trySyncActionsIntoScenarioText(text, [])
    expect(result.ok).toBe(true)
    if (result.ok) {
      const parsed = JSON.parse(result.text)
      expect(parsed.actions).toBeUndefined()
      expect(parsed.connections).toBeUndefined()
    }
  })
})

/* -- trySyncDisplaysIntoScenarioText ----------------------------------- */

describe('trySyncDisplaysIntoScenarioText', () => {
  it('returns ok: false for empty text', () => {
    expect(trySyncDisplaysIntoScenarioText('', [])).toEqual({
      ok: false,
      reason: 'editor is empty',
    })
  })

  it('returns ok: false for invalid JSON', () => {
    const result = trySyncDisplaysIntoScenarioText('{bad}', [])
    expect(result.ok).toBe(false)
  })

  it('writes a Path display entry with topic and messageType', () => {
    const text = JSON.stringify(baseScenario, null, 2)
    const result = trySyncDisplaysIntoScenarioText(text, [
      selection('/circle_path', 'nav_msgs/msg/Path'),
    ])
    expect(result.ok).toBe(true)
    if (result.ok) {
      const parsed = JSON.parse(result.text)
      expect(parsed.displays).toHaveLength(1)
      expect(parsed.displays[0].source.topic).toBe('/circle_path')
      expect(parsed.displays[0].source.messageType).toBe('nav_msgs/msg/Path')
      expect(parsed.connections?.rosbridge).toEqual({ kind: 'rosbridge' })
    }
  })

  it('writes a PoseArray display with arrowSize style', () => {
    const text = JSON.stringify(baseScenario, null, 2)
    const result = trySyncDisplaysIntoScenarioText(text, [
      selection(
        '/poses',
        'geometry_msgs/msg/PoseArray',
        DEFAULT_POSE_ARRAY_VISUAL_CONFIG.color,
        DEFAULT_POSE_ARRAY_VISUAL_CONFIG.thickness,
        1.0,
      ),
    ])
    expect(result.ok).toBe(true)
    if (result.ok) {
      const parsed = JSON.parse(result.text)
      expect(parsed.displays[0].style?.arrowSize).toBe(1.0)
    }
  })

  it('reports changed: true when text changes', () => {
    const text = JSON.stringify(baseScenario, null, 2)
    const result = trySyncDisplaysIntoScenarioText(text, [
      selection('/a', 'nav_msgs/msg/Path'),
    ])
    expect(result.ok && result.changed).toBe(true)
  })

  it('removes displays when selections are empty', () => {
    const specWithDisplays: ScenarioSpec = {
      ...baseScenario,
      connections: conn,
      displays: [
        {
          source: { connection: 'rosbridge', topic: '/a', messageType: 'nav_msgs/msg/Path' },
        },
      ],
    }
    const text = JSON.stringify(specWithDisplays, null, 2)
    const result = trySyncDisplaysIntoScenarioText(text, [])
    expect(result.ok).toBe(true)
    if (result.ok) {
      const parsed = JSON.parse(result.text)
      expect(parsed.displays).toBeUndefined()
      expect(parsed.connections).toBeUndefined()
    }
  })

  it('preserves sibling fields', () => {
    const spec: ScenarioSpec = {
      ...baseScenario,
      interaction: { keyboardControl: { enabled: true } },
    }
    const text = JSON.stringify(spec, null, 2)
    const result = trySyncDisplaysIntoScenarioText(text, [
      selection('/a', 'nav_msgs/msg/Path'),
    ])
    expect(result.ok).toBe(true)
    if (result.ok) {
      const parsed = JSON.parse(result.text)
      expect(parsed.interaction?.keyboardControl?.enabled).toBe(true)
    }
  })

  it('does NOT write displays when no topics are selected', () => {
    const text = JSON.stringify(baseScenario, null, 2)
    const result = trySyncDisplaysIntoScenarioText(text, [])
    expect(result.ok).toBe(true)
    if (result.ok) {
      const parsed = JSON.parse(result.text)
      expect(parsed.displays).toBeUndefined()
      expect(parsed.connections).toBeUndefined()
    }
  })
})
