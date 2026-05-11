import RAPIER from '@dimforge/rapier2d-compat'
import type { VehicleMotionRuntime, VehicleRuntimeState } from '../../../simulation/physics/VehicleMotionRuntime'
import type { VehicleEntity } from '../../../simulation/entities/VehicleEntity'

/**
 * Rapier-backed vehicle motion runtime.
 *
 * Each vehicle is represented as a `kinematicVelocityBased` rigid body in a
 * persistent zero-gravity Rapier 2D world. On every `step(dt)` the runtime:
 *   1. sets each body's linear/angular velocity from the vehicle's controls
 *   2. steps the world by `dt`
 *   3. reads back the integrated pose and exposes it through `readVehicleState`
 *
 * Using kinematic-velocity bodies means Rapier handles numerical integration
 * while external callers still drive the velocities directly — the same
 * conceptual model as the kinematic runtime, but through Rapier's integrator.
 *
 * Requires async WASM initialization. Use `RapierVehicleMotionRuntime.create()`
 * instead of constructing directly. The async pattern mirrors
 * `RapierCollisionBackend2D.create()`.
 *
 * Architectural rules:
 *   - This file is the only place that imports Rapier.
 *   - `src/simulation/` must not import this class.
 *   - `VehicleDynamicsSystem` knows only the `VehicleMotionRuntime` contract.
 */
export class RapierVehicleMotionRuntime implements VehicleMotionRuntime {
  readonly name = 'rapier'

  private readonly rapier: typeof RAPIER
  private world: RAPIER.World
  private readonly bodies = new Map<string, RAPIER.RigidBody>()
  private readonly states = new Map<string, VehicleRuntimeState>()
  private currentVehicles: readonly VehicleEntity[] = []
  private disposed = false

  private constructor(rapier: typeof RAPIER) {
    this.rapier = rapier
    this.world = new rapier.World({ x: 0, y: 0 })
  }

  static async create(): Promise<RapierVehicleMotionRuntime> {
    await RAPIER.init()
    return new RapierVehicleMotionRuntime(RAPIER)
  }

  reset(): void {
    this.world.free()
    this.world = new this.rapier.World({ x: 0, y: 0 })
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

    // Remove bodies for vehicles that no longer exist
    for (const [id, body] of this.bodies) {
      if (!activeIds.has(id)) {
        this.world.removeRigidBody(body)
        this.bodies.delete(id)
        this.states.delete(id)
      }
    }

    // Create bodies for newly seen vehicles, seeded from their current pose
    for (const vehicle of vehicles) {
      if (!this.bodies.has(vehicle.id)) {
        const bodyDesc = this.rapier.RigidBodyDesc.kinematicVelocityBased()
          .setTranslation(vehicle.pose.position.x, vehicle.pose.position.y)
          .setRotation(vehicle.pose.yaw)
        const body = this.world.createRigidBody(bodyDesc)
        this.world.createCollider(this.rapier.ColliderDesc.ball(vehicle.radius), body)
        this.bodies.set(vehicle.id, body)
      }
    }
  }

  step(dt: number): void {
    this.world.timestep = dt

    // Drive each body's velocity from the vehicle's current commands
    for (const vehicle of this.currentVehicles) {
      const body = this.bodies.get(vehicle.id)
      if (!body) continue
      const { v, w } = vehicle.controls
      const yaw = body.rotation()
      body.setLinvel({ x: v * Math.cos(yaw), y: v * Math.sin(yaw) }, true)
      body.setAngvel(w, true)
    }

    this.world.step()

    // Read integrated state back into normalized form
    for (const vehicle of this.currentVehicles) {
      const body = this.bodies.get(vehicle.id)
      if (!body) continue
      const pos = body.translation()
      const yaw = body.rotation()
      const angvel = body.angvel()
      this.states.set(vehicle.id, {
        vehicleId: vehicle.id,
        pose: { x: pos.x, y: pos.y, yaw },
        velocity: { linear: vehicle.controls.v, angular: angvel },
        distanceTraveled: vehicle.distanceTraveled + Math.abs(vehicle.controls.v) * dt,
      })
    }
  }

  readVehicleState(vehicleId: string): VehicleRuntimeState | undefined {
    return this.states.get(vehicleId)
  }
}
