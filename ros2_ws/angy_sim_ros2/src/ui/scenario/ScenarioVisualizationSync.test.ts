import { describe, expect, it } from 'vitest'
import {
  buildVisualizationFromRenderableSelections,
  mergeVisualizationIntoScenario,
  trySyncVisualizationIntoScenarioText,
} from './ScenarioVisualizationSync'
import {
  DEFAULT_PATH_VISUAL_CONFIG,
  type RenderableTopicSelection,
} from '../../app/RenderableTopics'
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
): RenderableTopicSelection => ({
  topicName: topic,
  messageType,
  kind: 'path2d',
  visualConfig: { color, thickness },
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
})
