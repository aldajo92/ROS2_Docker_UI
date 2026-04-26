import { Point3D } from './Point3D'
import { Vector3D } from './Vector3D'

/**
 * 3D pose: position + Euler orientation (roll, pitch, yaw) in radians.
 *
 * Euler angles are simple but suffer from gimbal lock; for serious 3D
 * work this should grow to a quaternion. Kept as Euler here because
 * the simulator's primary surface is 2D and 3D is for renderer hints.
 */
export class Pose3D {
  readonly position: Point3D
  readonly orientation: Vector3D // (roll, pitch, yaw) in radians

  constructor(position: Point3D, orientation: Vector3D) {
    this.position = position
    this.orientation = orientation
  }

  static identity(): Pose3D {
    return new Pose3D(Point3D.origin(), Vector3D.zero())
  }

  static of(x: number, y: number, z: number, roll = 0, pitch = 0, yaw = 0): Pose3D {
    return new Pose3D(new Point3D(x, y, z), new Vector3D(roll, pitch, yaw))
  }

  with(overrides: { position?: Point3D; orientation?: Vector3D }): Pose3D {
    return new Pose3D(
      overrides.position ?? this.position,
      overrides.orientation ?? this.orientation,
    )
  }
}
