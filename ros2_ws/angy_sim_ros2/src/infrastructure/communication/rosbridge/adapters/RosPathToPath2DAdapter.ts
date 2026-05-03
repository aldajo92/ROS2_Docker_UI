import type { MessageAdapter } from '../../../../simulation/communication/MessageAdapter'
import type { Path2D } from '../../../../simulation/paths/Path2D'
import type { PathPoint2D } from '../../../../simulation/paths/PathPoint2D'
import type {
  RosPathMessage,
  RosPoseStampedMessage,
  RosQuaternionMessage,
} from '../RosMessageTypes'

export interface RosPathToPath2DAdapterOptions {
  /**
   * Stable id used for the produced `Path2D`. The simulator uses this
   * id to key `PathRegistry` entries — a fixed id per topic means the
   * next message overwrites the previous render in place rather than
   * piling up duplicates.
   */
  pathId: string
  /**
   * Optional human-readable name surfaced in the renderer's debug
   * tooltip. Defaults to the `pathId`.
   */
  pathName?: string
}

/**
 * Adapter: `nav_msgs/msg/Path` ↔ `Path2D`.
 *
 * Inbound (`toInternal`):
 *   - `header.frame_id`  → `Path2D.frameId`
 *   - For each `poses[i]`:
 *       `pose.position.x|y` → `points[i].{x,y}`
 *       `yaw(pose.orientation)` → `points[i].yaw` (rad, derived from
 *       the quaternion's z-component when the path is planar — which
 *       is the only case `Path2D` represents).
 *
 * Outbound (`fromInternal`) is intentionally NOT implemented: the
 * simulator never publishes a `Path2D` back over rosbridge today.
 * Calling it throws so a future caller can't silently get an empty
 * message.
 *
 * Validation: the adapter is strict about *shape* (position must be
 * `{x,y,z}` finite numbers, etc.) but tolerant of optional fields.
 * A malformed pose causes the *whole* message to be dropped — partial
 * paths are worse than no path because the renderer would draw a
 * jagged line through unrelated waypoints.
 */
export class RosPathToPath2DAdapter
  implements MessageAdapter<unknown, Path2D>
{
  private readonly pathId: string
  private readonly pathName?: string

  constructor(options: RosPathToPath2DAdapterOptions) {
    if (typeof options.pathId !== 'string' || options.pathId.length === 0) {
      throw new Error(
        'RosPathToPath2DAdapter: pathId must be a non-empty string',
      )
    }
    this.pathId = options.pathId
    this.pathName = options.pathName ?? options.pathId
  }

  toInternal(message: unknown): Path2D {
    const path = assertPath(message)
    const points = path.poses.map((p, i) => poseStampedToPoint(p, i))
    const frameId = path.header?.frame_id?.trim()
    return {
      id: this.pathId,
      name: this.pathName,
      points,
      ...(frameId ? { frameId } : {}),
    }
  }

  fromInternal(): never {
    throw new Error(
      'RosPathToPath2DAdapter.fromInternal: outbound conversion is not implemented',
    )
  }
}

function assertPath(message: unknown): RosPathMessage {
  if (typeof message !== 'object' || message === null) {
    throw new Error('Path message must be an object')
  }
  const value = message as { header?: unknown; poses?: unknown }
  if (!Array.isArray(value.poses)) {
    throw new Error('Path.poses must be an array')
  }
  // Header is optional; only validate frame_id when present so a
  // simulator publishing a path without a header isn't dropped.
  if (value.header !== undefined && value.header !== null) {
    if (typeof value.header !== 'object') {
      throw new Error('Path.header must be an object')
    }
  }
  return value as RosPathMessage
}

function poseStampedToPoint(
  pose: RosPoseStampedMessage,
  index: number,
): PathPoint2D {
  if (typeof pose !== 'object' || pose === null) {
    throw new Error(`Path.poses[${index}] must be an object`)
  }
  const inner = (pose as { pose?: unknown }).pose
  if (typeof inner !== 'object' || inner === null) {
    throw new Error(`Path.poses[${index}].pose must be an object`)
  }
  const { position, orientation } = inner as {
    position?: unknown
    orientation?: unknown
  }
  if (typeof position !== 'object' || position === null) {
    throw new Error(`Path.poses[${index}].pose.position must be an object`)
  }
  const x = requireFiniteNumber(
    (position as { x?: unknown }).x,
    `Path.poses[${index}].pose.position.x`,
  )
  const y = requireFiniteNumber(
    (position as { y?: unknown }).y,
    `Path.poses[${index}].pose.position.y`,
  )
  // z is required by the wire shape but unused in 2D — still validate
  // so a malformed publisher fails loudly.
  requireFiniteNumber(
    (position as { z?: unknown }).z,
    `Path.poses[${index}].pose.position.z`,
  )
  const point: PathPoint2D = { x, y }
  if (orientation !== undefined && orientation !== null) {
    const yaw = quaternionToYaw(orientation as RosQuaternionMessage)
    if (yaw !== undefined) point.yaw = yaw
  }
  return point
}

function quaternionToYaw(q: RosQuaternionMessage): number | undefined {
  // Only return a yaw when the quaternion is a planar rotation about
  // +Z. A full 3D orientation can't be projected to a single 2D yaw
  // without losing information, so we leave `yaw` undefined in that
  // case and let the renderer treat the point as un-oriented.
  const { x, y, z, w } = q
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof z !== 'number' ||
    typeof w !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z) ||
    !Number.isFinite(w)
  ) {
    return undefined
  }
  // Standard ROS quaternion → yaw conversion, restricted to the planar
  // case (qx ≈ qy ≈ 0). Use a small epsilon to tolerate float drift.
  const PLANAR_EPS = 1e-6
  if (Math.abs(x) > PLANAR_EPS || Math.abs(y) > PLANAR_EPS) {
    return undefined
  }
  // yaw = atan2(2 * (w*z + x*y), 1 - 2 * (y*y + z*z))
  // Reduces to atan2(2*w*z, 1 - 2*z*z) when x = y = 0.
  return Math.atan2(2 * w * z, 1 - 2 * z * z)
}

function requireFiniteNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`)
  }
  return value
}
