import type { MessageAdapter } from '../../../../simulation/communication/MessageAdapter'
import type { PoseArray2D } from '../../../../simulation/poses/PoseArray2D'
import type { PoseMarker2D } from '../../../../simulation/poses/PoseMarker2D'
import type {
  RosPoseArrayMessage,
  RosPoseMessage,
  RosQuaternionMessage,
} from '../RosMessageTypes'

/**
 * Convert a `geometry_msgs/msg/PoseArray` wire message to a {@link PoseArray2D}.
 * Only the x/y position and Z-axis yaw are extracted; the Z position and
 * roll/pitch components are discarded (2-D simulator).
 *
 * Quaternion → yaw formula (standard ZYX Euler decomposition):
 *   yaw = atan2(2(qw·qz + qx·qy), 1 − 2(qy² + qz²))
 */
export class RosPoseArrayToPoseArray2DAdapter
  implements MessageAdapter<unknown, PoseArray2D>
{
  private readonly artifactId: string

  constructor(artifactId: string) {
    this.artifactId = artifactId
  }

  toInternal(message: unknown): PoseArray2D {
    const msg = message as RosPoseArrayMessage
    const poses: PoseMarker2D[] = (msg.poses ?? []).map((p: RosPoseMessage) => ({
      x: p.position?.x ?? 0,
      y: p.position?.y ?? 0,
      yaw: quaternionToYaw(p.orientation),
    }))

    return {
      id: this.artifactId,
      frameId: msg.header?.frame_id,
      poses,
    }
  }

  fromInternal(): never {
    throw new Error('RosPoseArrayToPoseArray2DAdapter.fromInternal not implemented')
  }
}

function quaternionToYaw(q: RosQuaternionMessage | undefined): number {
  if (!q) return 0
  const { x = 0, y = 0, z = 0, w = 1 } = q
  return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))
}
