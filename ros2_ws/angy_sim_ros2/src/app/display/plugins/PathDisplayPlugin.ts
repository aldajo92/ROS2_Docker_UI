import type { Path2D } from '../../../simulation/paths/Path2D'
import type {
  DisplayPlugin,
  DisplayRuntimeContext,
  DisplayVisualConfig,
} from '../DisplayPlugin'

export interface PathVisualConfig extends DisplayVisualConfig {
  color: string
  thickness: number
}

export const PATH_DISPLAY_PLUGIN_ID = 'path2d' as const

/**
 * Display plugin for nav_msgs/msg/Path → Path2D artifacts.
 *
 * Owns the visual lifecycle (color, thickness) of Path2D entries in
 * state.paths. Does NOT know about ROS, rosbridge, roslib, renderers,
 * or React — those concerns live in the transport binding and renderer
 * layers respectively.
 */
export const pathDisplayPlugin: DisplayPlugin<Path2D, PathVisualConfig> = {
  id: PATH_DISPLAY_PLUGIN_ID,
  label: 'Path',
  artifactKind: 'path2d',
  defaultConfig: { color: '#f0c14a', thickness: 2 },

  applyConfig(path: Path2D, config: PathVisualConfig): Path2D {
    return { ...path, color: config.color, thickness: config.thickness }
  },

  enqueueUpsert(path: Path2D, context: DisplayRuntimeContext): void {
    context.pathQueue.enqueueUpsert(path)
  },

  enqueueRemove(id: string, context: DisplayRuntimeContext): void {
    context.pathQueue.enqueueRemove(id)
  },
}
