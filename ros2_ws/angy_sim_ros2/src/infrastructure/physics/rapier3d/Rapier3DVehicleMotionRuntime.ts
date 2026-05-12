import RAPIER from '@dimforge/rapier3d-compat'
import type { VehicleMotionRuntime, VehicleRuntimeState } from '../../../simulation/physics/VehicleMotionRuntime'
import type { VehicleEntity } from '../../../simulation/entities/VehicleEntity'

// Fraction of the velocity error corrected by a single drive impulse.
// At steady state (v_actual = v_target) the impulse is zero and position
// integrates as exactly v × dt, which preserves the proportionality contract.
// After a contact impulse reduces v_actual, the drive restores only ALPHA of
// the gap per step, so the contact solver has time to separate bodies before
// the full commanded speed is reached again (~1/ALPHA steps to fully recover).
const VELOCITY_ALPHA = 0.4

const COLLIDER_FRICTION = 0.5     // Moderate lateral friction between colliders.
const COLLIDER_RESTITUTION = 0.3  // Slight bounce on contact.
// Solid-sphere moment of inertia: I = factor × m × r².
const SPHERE_INERTIA_FACTOR = 2 / 5

/**
 * Rapier 3D vehicle motion runtime — ADDITIVE EXPERIMENTAL.
 *
 * ## Body type: dynamic with ground-plane constraints
 *
 * Vehicles are `dynamic` rigid bodies constrained to the XY ground plane:
 * - Translation locked to XY (Z=0) via `enabledTranslations(true,true,false)`.
 * - Rotation locked to Z axis (yaw only) via `enabledRotations(false,false,true)`.
 *
 * ## Control model: bounded velocity-error impulse
 *
 * Each tick a single drive impulse is applied BEFORE `world.step()`:
 *
 *   J_linear  = mass × (v_target − v_actual) × VELOCITY_ALPHA
 *   J_angular = I    × (w_target − w_actual) × VELOCITY_ALPHA
 *
 * where I = (2/5) × mass × radius².
 *
 * At steady state (v_actual = v_target the impulse is zero; the body moves at
 * exactly the commanded speed with no extra force fighting the solver.
 * After a contact impulse reduces v_actual the drive corrects only VELOCITY_ALPHA
 * of the residual gap per step, so the contact constraint dominates separation
 * (~1/VELOCITY_ALPHA ≈ 2–3 steps to recover significant velocity). This is
 * fundamentally different from the previous velocity-override approach, which
 * immediately reset velocity every frame and gave the solver zero time to act.
 *
 * ## Why this is better than velocity override
 *
 * With `setLinvel` every frame the drive force was effectively infinite:
 * whatever velocity the solver produced was discarded on the next tick.
 * With a bounded impulse the maximum drive contribution per step is:
 *
 *   |J_max| = VELOCITY_ALPHA × mass × |v_target| ≈ 0.107 N·s  (v=1, r=0.4 m)
 *
 * Rapier's velocity-based constraint solver can supply an equal and opposite
 * contact impulse at the contact surface without requiring penetration, so
 * bodies stabilise at approximately 2 × radius separation in the typical case.
 *
 * ## Body initialisation
 *
 * Each new body is seeded with the vehicle's current command as its initial
 * linvel/angvel so that the drive impulse is zero on the very first tick and
 * the body immediately moves at the commanded speed.
 *
 * ## Readback contract (unchanged)
 *
 * After `world.step()` state is read from the body, not from commands:
 *   pose            : {x, y, yaw}   — contact-resolved position / orientation
 *   velocity.linear : actual speed  — may differ from |v| if contact occurred
 *   distanceTraveled: += actualSpeed × dt
 *
 * ## Physical parameters
 *
 * | Parameter              | Value | Rationale                                        |
 * |------------------------|-------|--------------------------------------------------|
 * | VELOCITY_ALPHA         | 0.4   | 40% of velocity error corrected per step          |
 * | COLLIDER_FRICTION      | 0.5   | Moderate lateral friction at contacts             |
 * | COLLIDER_RESTITUTION   | 0.3   | Slight bounce; avoids sticky contacts             |
 * | SPHERE_INERTIA_FACTOR  | 2/5   | Solid-sphere approximation: I = 0.4·m·r²          |
 *
 * ## Limitations of this stage
 *
 * - Under sustained opposing drive a small residual jitter remains at the
 *   contact boundary (< 1 cm at typical simulation parameters).
 * - No lateral tyre model; bodies can still slide sideways after contact.
 * - Mass determined by collider density defaults (not tuned per vehicle).
 * - Not suitable for high-fidelity dynamics.
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

interface BodyRecord {
  body: RAPIER.RigidBody
  radius: number
}

export class Rapier3DVehicleMotionRuntime implements VehicleMotionRuntime {
  readonly name = 'rapier3d'

  private readonly rapier: typeof RAPIER
  private world: RAPIER.World
  private readonly bodies = new Map<string, BodyRecord>()
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

    for (const [id, record] of this.bodies) {
      if (!activeIds.has(id)) {
        this.world.removeRigidBody(record.body)
        this.bodies.delete(id)
        this.states.delete(id)
      }
    }

    for (const vehicle of vehicles) {
      if (!this.bodies.has(vehicle.id)) {
        const { x, y } = vehicle.pose.position
        const yaw = vehicle.pose.yaw
        const { v, w } = vehicle.controls
        // Seed initial velocity from the current command so the drive impulse
        // is zero on the first tick (v_actual = v_target → J = 0).
        const bodyDesc = this.rapier.RigidBodyDesc.dynamic()
          .setTranslation(x, y, 0)
          .setRotation(yawToQuat(yaw))
          .setLinvel(v * Math.cos(yaw), v * Math.sin(yaw), 0)
          .setAngvel({ x: 0, y: 0, z: w })
          .enabledTranslations(true, true, false)
          .enabledRotations(false, false, true)
        const body = this.world.createRigidBody(bodyDesc)
        this.world.createCollider(
          this.rapier.ColliderDesc.ball(vehicle.radius)
            .setFriction(COLLIDER_FRICTION)
            .setRestitution(COLLIDER_RESTITUTION),
          body,
        )
        this.bodies.set(vehicle.id, { body, radius: vehicle.radius })
      }
    }
  }

  step(dt: number): void {
    this.world.timestep = dt

    for (const vehicle of this.currentVehicles) {
      const record = this.bodies.get(vehicle.id)
      if (!record) continue
      const { body, radius } = record
      const { v, w } = vehicle.controls
      const yaw = quatToYaw(body.rotation())
      const m = body.mass()
      // Solid-sphere moment of inertia approximation.
      const I = SPHERE_INERTIA_FACTOR * m * radius * radius

      const vel = body.linvel()
      const angvelZ = body.angvel().z
      const vDesX = v * Math.cos(yaw)
      const vDesY = v * Math.sin(yaw)

      // Bounded drive impulse: closes VELOCITY_ALPHA of the velocity gap.
      // When v_actual = v_target this is zero — no force fights the solver.
      // After a contact impulse the drive restores only a fraction per step,
      // letting the contact constraint maintain separation.
      body.applyImpulse(
        {
          x: m * (vDesX - vel.x) * VELOCITY_ALPHA,
          y: m * (vDesY - vel.y) * VELOCITY_ALPHA,
          z: 0,
        },
        true,
      )
      body.applyTorqueImpulse(
        { x: 0, y: 0, z: I * (w - angvelZ) * VELOCITY_ALPHA },
        true,
      )
    }

    this.world.step()

    for (const vehicle of this.currentVehicles) {
      const record = this.bodies.get(vehicle.id)
      if (!record) continue
      const { body } = record
      const pos = body.translation()
      const yaw = quatToYaw(body.rotation())
      const linvel = body.linvel()
      const actualSpeed = Math.hypot(linvel.x, linvel.y)
      this.states.set(vehicle.id, {
        vehicleId: vehicle.id,
        pose: { x: pos.x, y: pos.y, yaw },
        velocity: { linear: actualSpeed, angular: body.angvel().z },
        distanceTraveled: vehicle.distanceTraveled + actualSpeed * dt,
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
