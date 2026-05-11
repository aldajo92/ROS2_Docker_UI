/**
 * Internal representation of a pose with covariance, suitable for outbound
 * telemetry. Keep this type free of ROS-specific classes or imports — the
 * rosbridge adapter owns the translation to wire format.
 *
 * `covariance` is a 36-element row-major matrix over [x, y, z, roll, pitch, yaw].
 * For 2D use: indices [0]=varX, [7]=varY, [35]=varYaw; all others are 0.
 */
export interface SimPoseWithCovarianceMessage {
  header: {
    stampSec: number
    frameId: string
  }
  childFrameId?: string
  pose: {
    x: number
    y: number
    z?: number
    yaw: number
  }
  covariance: number[]
  source: {
    vehicleId: string
    measurement: 'noisy_pose'
  }
}
