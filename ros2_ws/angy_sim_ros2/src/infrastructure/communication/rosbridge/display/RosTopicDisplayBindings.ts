import type { Path2D } from '../../../../simulation/paths/Path2D'
import { RosPathToPath2DAdapter } from '../adapters/RosPathToPath2DAdapter'
import type { RosTopicDisplayBinding } from './RosTopicDisplayBinding'

const pathBinding: RosTopicDisplayBinding<Path2D> = {
  messageType: 'nav_msgs/msg/Path',
  displayPluginId: 'path2d',
  createAdapter: ({ artifactId, artifactName }) =>
    new RosPathToPath2DAdapter({ pathId: artifactId, pathName: artifactName }),
}

/**
 * All ROS 2 message-type → display-plugin bindings available at runtime.
 * Add new entries here when supporting additional message types.
 */
export const ROS_TOPIC_DISPLAY_BINDINGS: ReadonlyArray<
  RosTopicDisplayBinding<unknown>
> = Object.freeze([pathBinding as RosTopicDisplayBinding<unknown>])

/**
 * Resolve a ROS message type string to its binding, or undefined when there
 * is no registered binding for that type.
 */
export function findRosTopicDisplayBinding(
  messageType: string,
  bindings: ReadonlyArray<
    RosTopicDisplayBinding<unknown>
  > = ROS_TOPIC_DISPLAY_BINDINGS,
): RosTopicDisplayBinding<unknown> | undefined {
  return bindings.find((b) => b.messageType === messageType)
}
