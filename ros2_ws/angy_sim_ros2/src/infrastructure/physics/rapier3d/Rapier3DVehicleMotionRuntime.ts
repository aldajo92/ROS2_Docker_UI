import RAPIER from '@dimforge/rapier3d-compat'
import type { VehicleMotionRuntime, VehicleRuntimeState } from '../../../simulation/physics/VehicleMotionRuntime'
import type { VehicleEntity } from '../../../simulation/entities/VehicleEntity'

/**
 * Rapier 3D vehicle motion runtime — ADDITIVE EXPERIMENTAL SPIKE.
 *
 * ## Current capability (kinematic-in-3D)
 *
 * Vehicles are `kinematicVelocityBased` rigid bodies in a Rapier 3D world.
 * On every `step(dt)` their velocities are set directly from the unicycle
 * controls — identical in spirit to `KinematicVehicleMotionRuntime`, but
 * executed inside the 3D engine. Kinematic bodies are **NOT blocked or
 * deflected by obstacles**: they pass through other bodies without physical
 * contact resolution. This runtime does not yet deliver rigid-body collision
 * response.
 *
 * ## What it adds over the 2D baseline
 *
 * - Runs inside the Rapier 3D physics pipeline (separate WASM instance).
 * - 3D collision detection is active (events fire), enabling future extensions
 *   such as raycasting against 3D geometry or sensor overlap queries.
 * - State is projected back to the 2D-compatible `VehicleRuntimeState` shape
 *   so existing renderers and scenarios work without modification.
 *
 * ## Future work to deliver true collision-resolving dynamics
 *
 * Switch vehicle bodies to `RigidBodyDesc.dynamic()` and control them via
 * impulse/force application instead of velocity overrides. That lets Rapier's
 * solver resolve contact constraints so vehicles are physically blocked by
 * obstacles. The projection layer (quatToYaw / `VehicleRuntimeState`) stays
 * unchanged; only the body creation and tick loop change.
 *
 * ## Ground-plane convention
 *
 *   position : (x, y, z=0)
 *   rotation : quaternion for yaw around Z — q = {x:0, y:0, z:sin(yaw/2), w:cos(yaw/2)}
 *   linvel   : {x: v·cos(yaw), y: v·sin(yaw), z: 0}
 *   angvel   : {x: 0, y: 0, z: w}
 *
 * Architectural rules (mirror of RapierVehicleMotionRuntime):
 *   - This file is the only place that imports @dimforge/rapier3d-compat.
 *   - src/simulation/ must not import this class.
 *   - VehicleDynamicsSystem knows only the VehicleMotionRuntime contract.
 */
export class Rapier3DVehicleMotionRuntime implements VehicleMotionRuntime {
  readonly name = 'rapier3d'

  private readonly rapier: typeof RAPIER
  private world: RAPIER.World
  private readonly bodies = new Map<string, RAPIER.RigidBody>()
  private readonly states = new Map<string, VehicleRuntimeState>()
  private currentVehicles: readonly VehicleEntity[] = []
  private disposed = false

  private constructor(rapier: typeof RAPIER) {
    this.rapier = rapier
    this.world = new rapier.World({ x: 0, y: 0, z: 0 })
  }

  static async create(): Promise<Rapier3DVehicleMotionRuntime> {
    await RAPIER.init()
    return new Rapier3DVehicleMotionRuntime(RAPIER)
  }

  reset(): void {
    this.world.free()
    this.world = new this.rapier.World({ x: 0, y: 0, z: 0 })
    this.bodies.clear()
    this.states.clear()
    this.currentVehicles = []
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.world.free()
    this.bodies.clear()
    this.states.clear()
  }

  syncVehicles(vehicles: readonly VehicleEntity[]): void {
    this.currentVehicles = vehicles
    const activeIds = new Set(vehicles.map((v) => v.id))

    for (const [id, body] of this.bodies) {
      if (!activeIds.has(id)) {
        this.world.removeRigidBody(body)
        this.bodies.delete(id)
        this.states.delete(id)
      }
    }

    for (const vehicle of vehicles) {
      if (!this.bodies.has(vehicle.id)) {
        const { x, y } = vehicle.pose.position
        const yaw = vehicle.pose.yaw
        const bodyDesc = this.rapier.RigidBodyDesc.kinematicVelocityBased()
          .setTranslation(x, y, 0)
          .setRotation(yawToQuat(yaw))
        const body = this.world.createRigidBody(bodyDesc)
        // Sphere collider — matches the existing 2D ball collider convention.
        // The 3D world owns collision detection geometry; future iterations can
        // switch to a cylinder for more realistic ground-vehicle contact.
        this.world.createCollider(
          this.rapier.ColliderDesc.ball(vehicle.radius),
          body,
        )
        this.bodies.set(vehicle.id, body)
      }
    }
  }

  step(dt: number): void {
    this.world.timestep = dt

    for (const vehicle of this.currentVehicles) {
      const body = this.bodies.get(vehicle.id)
      if (!body) continue
      const { v, w } = vehicle.controls
      const yaw = quatToYaw(body.rotation())
      body.setLinvel({ x: v * Math.cos(yaw), y: v * Math.sin(yaw), z: 0 }, true)
      body.setAngvel({ x: 0, y: 0, z: w }, true)
    }

    this.world.step()

    for (const vehicle of this.currentVehicles) {
      const body = this.bodies.get(vehicle.id)
      if (!body) continue
      const pos = body.translation()
      const yaw = quatToYaw(body.rotation())
      const angvelZ = body.angvel().z
      this.states.set(vehicle.id, {
        vehicleId: vehicle.id,
        pose: { x: pos.x, y: pos.y, yaw },
        velocity: { linear: vehicle.controls.v, angular: angvelZ },
        distanceTraveled: vehicle.distanceTraveled + Math.abs(vehicle.controls.v) * dt,
      })
    }
  }

  readVehicleState(vehicleId: string): VehicleRuntimeState | undefined {
    return this.states.get(vehicleId)
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

/** Yaw (rotation around Z axis) → unit quaternion. */
function yawToQuat(yaw: number): { x: number; y: number; z: number; w: number } {
  return { x: 0, y: 0, z: Math.sin(yaw / 2), w: Math.cos(yaw / 2) }
}

/**
 * Quaternion → yaw (rotation around Z axis).
 * Valid for any quaternion; uses the standard ZYX Euler extraction formula.
 */
function quatToYaw(q: { x: number; y: number; z: number; w: number }): number {
  return Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z))
}
