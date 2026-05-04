import type { ExternalPathUpdateQueue } from '../../simulation/paths/ExternalPathUpdateQueue'
import type { ExternalPoseArrayUpdateQueue } from '../../simulation/poses/ExternalPoseArrayUpdateQueue'

/**
 * Visual configuration shared by every display plugin. Plugins extend this
 * with additional fields; the Inspector can render a generic color swatch and
 * thickness slider for any plugin without knowing the concrete type.
 */
export interface DisplayVisualConfig {
  color?: string
  thickness?: number
}

/**
 * Runtime services injected into plugin operations. Kept free of
 * ROS/rosbridge/roslib types — plugins must not know which transport produced
 * the artifact they are managing.
 *
 * As new artifact types are added, extend this interface with the
 * corresponding simulation-side queue or registry.
 */
export interface DisplayRuntimeContext {
  pathQueue: ExternalPathUpdateQueue
  poseArrayQueue: ExternalPoseArrayUpdateQueue
}

/**
 * Transport-agnostic display plugin. Owns the lifecycle of one internal
 * visual artifact kind (Path2D, PointMarker2D, …).
 *
 * Boundary rules (enforced by architecture.display.test.ts):
 *   - Must NOT import roslib, rosbridge infrastructure, renderer modules
 *     (Three.js / Phaser), or React.
 *   - Receives internal simulator artifact types only.
 *   - Talks to simulation services exclusively via DisplayRuntimeContext.
 *
 * Adding a new artifact kind requires:
 *   1. A new plugin here implementing this interface.
 *   2. A transport binding under src/infrastructure/communication/<vendor>/display/.
 *   3. Registration in DisplayPluginRegistry.
 */
export interface DisplayPlugin<TArtifact, TConfig extends DisplayVisualConfig> {
  /** Unique id — shared with the transport binding's displayPluginId. */
  readonly id: string
  /** Human-readable label for the Inspector. */
  readonly label: string
  /** Artifact kind string — matches SimulationState registry key conventions. */
  readonly artifactKind: string
  /** Default visual config for newly selected topics. */
  readonly defaultConfig: TConfig

  /**
   * Return a new artifact with the visual config applied. Must NOT mutate
   * the input artifact.
   */
  applyConfig(artifact: TArtifact, config: TConfig): TArtifact

  /** Enqueue an upsert of the artifact into the appropriate simulation queue. */
  enqueueUpsert(artifact: TArtifact, context: DisplayRuntimeContext): void

  /** Enqueue removal of the artifact by id. */
  enqueueRemove(id: string, context: DisplayRuntimeContext): void
}
