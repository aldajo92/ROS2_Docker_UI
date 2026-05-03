import { Ros, Topic } from 'roslib'
import type {
  RosFactory,
  RosLike,
  TopicFactory,
  TopicLike,
} from './RoslibRosbridgeTransport'

/**
 * Concrete factories that produce a real `roslibjs` `Ros` / `Topic`.
 *
 * **This is the ONLY runtime import of `roslib` in the codebase.**
 * Keeping it isolated here means:
 *
 *   - `RoslibRosbridgeTransport.ts` only `import type`s from roslib,
 *     so importing the transport (e.g. for unit tests) does not pull
 *     in roslib's runtime.
 *   - Replacing roslib with another rosbridge client (or an entirely
 *     different transport) only touches this file plus the factory
 *     wiring in `CommunicationProvider`.
 *   - The architecture-boundary test (`architecture.rosbridge.test.ts`)
 *     can mechanically prove that no file outside this directory
 *     imports `roslib`.
 *
 * roslib's `Ros` and `Topic` classes structurally match `RosLike` and
 * `TopicLike` (same method names + signatures), so a single cast at
 * the boundary is enough.
 */

export const defaultRosFactory: RosFactory = () => {
  // Construct without `url` so the transport drives the connect()
  // lifecycle explicitly. roslib's `Ros` will auto-connect if a `url`
  // is passed to the constructor — we want explicit control instead.
  const ros = new Ros({})
  return ros as unknown as RosLike
}

export const defaultTopicFactory: TopicFactory = <T = unknown>(args: {
  ros: RosLike
  name: string
  messageType: string
}) => {
  const topic = new Topic<T>({
    ros: args.ros as unknown as Ros,
    name: args.name,
    messageType: args.messageType,
  })
  return topic as unknown as TopicLike<T>
}
