import type { PoseArray2D } from '../../../simulation/poses/PoseArray2D'
import type { DisplayPlugin, DisplayRuntimeContext, DisplayVisualConfig } from '../DisplayPlugin'

export const POSE_ARRAY_DISPLAY_PLUGIN_ID = 'pose_array_2d' as const

export interface PoseArrayVisualConfig extends DisplayVisualConfig {
  color: string
  /** Total arrow length in meters. */
  arrowSize: number
  thickness: number
}

export const DEFAULT_POSE_ARRAY_VISUAL_CONFIG: PoseArrayVisualConfig = {
  color: '#00bcd4',
  arrowSize: 0.5,
  thickness: 2,
}

export const poseArrayDisplayPlugin: DisplayPlugin<PoseArray2D, PoseArrayVisualConfig> = {
  id: POSE_ARRAY_DISPLAY_PLUGIN_ID,
  label: 'Pose Array',
  artifactKind: POSE_ARRAY_DISPLAY_PLUGIN_ID,
  defaultConfig: DEFAULT_POSE_ARRAY_VISUAL_CONFIG,

  applyConfig(artifact: PoseArray2D, config: PoseArrayVisualConfig): PoseArray2D {
    return {
      ...artifact,
      color: config.color,
      arrowSize: config.arrowSize,
      thickness: config.thickness,
    }
  },

  enqueueUpsert(artifact: PoseArray2D, context: DisplayRuntimeContext): void {
    context.poseArrayQueue.enqueueUpsert(artifact)
  },

  enqueueRemove(id: string, context: DisplayRuntimeContext): void {
    context.poseArrayQueue.enqueueRemove(id)
  },
}
