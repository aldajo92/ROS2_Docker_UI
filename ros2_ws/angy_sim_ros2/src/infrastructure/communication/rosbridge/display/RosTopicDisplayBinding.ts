import type { MessageAdapter } from '../../../../simulation/communication/MessageAdapter'

/**
 * Maps one external ROS 2 message type to an internal display plugin.
 *
 * Boundary rules:
 *   - Lives under src/infrastructure/communication/rosbridge/ and may import
 *     rosbridge adapters and ROS message type constants.
 *   - Must NOT import renderer modules (Three.js, Phaser) or simulation
 *     systems.
 *   - References a DisplayPlugin by id string; does NOT import the plugin
 *     directly so the coupling is one-directional (binding → adapter only).
 */
export interface RosTopicDisplayBinding<TArtifact> {
  /** ROS 2 message type string, e.g. 'nav_msgs/msg/Path'. */
  readonly messageType: string
  /** Id of the DisplayPlugin that manages artifacts produced by this binding. */
  readonly displayPluginId: string
  /**
   * Factory for the wire-format → internal-artifact adapter.
   * A new adapter instance is created per subscription so each topic
   * carries its own stable artifactId.
   */
  createAdapter(options: {
    artifactId: string
    artifactName?: string
  }): MessageAdapter<unknown, TArtifact>
}
