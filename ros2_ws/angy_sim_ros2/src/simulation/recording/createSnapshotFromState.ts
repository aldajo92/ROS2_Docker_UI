import type { Entity } from '../entities/Entity'
import type { SimulationState } from '../core/SimulationState'
import { DynamicActorEntity } from '../entities/DynamicActorEntity'
import { StaticObstacleEntity } from '../entities/StaticObstacleEntity'
import { VehicleEntity } from '../entities/VehicleEntity'
import type { EntityTrajectory2D } from '../trajectories/EntityTrajectory2D'
import type {
  DynamicActorEntitySnapshot,
  EntitySnapshot,
  GenericEntitySnapshot,
  SimulationFrameSnapshot,
  StaticObstacleEntitySnapshot,
  VehicleEntitySnapshot,
} from './SimulationFrameSnapshot'

/**
 * Read-only conversion from live `SimulationState` to a
 * JSON-friendly `SimulationFrameSnapshot`.
 *
 * Contract:
 * - The returned object MUST be safe to `JSON.stringify` and round-trip
 *   back via `JSON.parse` without losing fidelity.
 * - The function MUST NOT mutate `state` or any entity.
 * - It uses only public entity APIs (no private field access).
 *
 * Tick numbering convention:
 * The simulation engine increments `state.metrics.ticks` AFTER all
 * systems run, then emits the `tick` event with the post-increment
 * count. The recorder system runs BEFORE that increment, so the
 * "current" tick is `state.metrics.ticks + 1` — matching the value
 * downstream consumers see in the `tick` event payload. (Same
 * convention used by `TrajectoryTrackingSystem`.)
 *
 * Unsupported entities fall back to {@link GenericEntitySnapshot} so
 * old recordings keep parsing as the project grows new entity types.
 */
export function createSnapshotFromState(
  state: SimulationState,
): SimulationFrameSnapshot {
  const tick = state.metrics.ticks + 1
  const timeSec = state.clock.time()

  const entities: EntitySnapshot[] = []
  for (const entity of state.entities.toArray()) {
    entities.push(toEntitySnapshot(entity))
  }

  const trajectories = toTrajectorySnapshots(state)

  const metrics = {
    totalDistance: state.metrics.totalDistance,
    peakSpeed: state.metrics.peakSpeed,
    collisionCount: state.metrics.collisionCount,
  }

  const lidarScans = state.lidarScans.toArray()

  return {
    tick,
    timeSec,
    entities,
    // Omit the field entirely when there are no trajectories to keep
    // older replay files byte-equivalent (and JSON outputs smaller for
    // scenarios that don't enable tracking).
    ...(trajectories.length > 0 ? { trajectories } : {}),
    metrics,
    // Omit lidarScans when the registry is empty — preserves byte
    // equivalence for scenarios that have no sensors configured.
    ...(lidarScans.length > 0 ? { lidarScans } : {}),
  }
}

/**
 * Materialize the contents of `state.trajectories` as a fresh,
 * mutable, JSON-safe array. `TrajectoryRegistry.toArray()` already
 * returns deep-cloned entries, so a shallow shape conversion is enough
 * here — we just strip the readonly markers and copy each sample/
 * metadata object so callers can mutate the returned array without
 * disturbing the registry.
 */
function toTrajectorySnapshots(state: SimulationState): EntityTrajectory2D[] {
  const out: EntityTrajectory2D[] = []
  for (const trajectory of state.trajectories.toArray()) {
    out.push({
      entityId: trajectory.entityId,
      samples: trajectory.samples.map((sample) => ({ ...sample })),
      metadata: trajectory.metadata
        ? { ...trajectory.metadata }
        : undefined,
    })
  }
  return out
}

function toEntitySnapshot(entity: Entity): EntitySnapshot {
  if (entity instanceof VehicleEntity) {
    return toVehicleSnapshot(entity)
  }
  if (entity instanceof StaticObstacleEntity) {
    return toStaticObstacleSnapshot(entity)
  }
  if (entity instanceof DynamicActorEntity) {
    return toDynamicActorSnapshot(entity)
  }
  return toGenericSnapshot(entity)
}

function toVehicleSnapshot(entity: VehicleEntity): VehicleEntitySnapshot {
  return {
    id: entity.id,
    kind: 'vehicle',
    pose: {
      x: entity.pose.position.x,
      y: entity.pose.position.y,
      yaw: entity.pose.yaw,
    },
    velocity: { v: entity.v, w: entity.w },
    radius: entity.radius,
  }
}

function toStaticObstacleSnapshot(
  entity: StaticObstacleEntity,
): StaticObstacleEntitySnapshot {
  if (entity.shape.type === 'rectangle') {
    return {
      id: entity.id,
      kind: 'static_obstacle',
      position: { x: entity.position.x, y: entity.position.y },
      radius: entity.radius,
      shape: 'rectangle',
      rectangle: {
        length: entity.shape.length,
        thickness: entity.shape.thickness,
        yaw: entity.shape.yaw,
      },
    }
  }
  // Keep the byte-for-byte legacy shape for circles: no `shape`, no
  // `rectangle` fields. Old consumers see the exact same JSON they
  // did before rectangles existed.
  return {
    id: entity.id,
    kind: 'static_obstacle',
    position: { x: entity.position.x, y: entity.position.y },
    radius: entity.radius,
  }
}

function toDynamicActorSnapshot(
  entity: DynamicActorEntity,
): DynamicActorEntitySnapshot {
  return {
    id: entity.id,
    kind: 'dynamic_actor',
    pose: {
      x: entity.pose.position.x,
      y: entity.pose.position.y,
      yaw: entity.pose.yaw,
    },
    velocity: {
      vx: entity.velocity.x,
      vy: entity.velocity.y,
      w: entity.angularVelocity,
    },
    radius: entity.radius,
  }
}

/**
 * Fallback shape for any entity subclass not enumerated above. We
 * keep the public `id` and `type` so renderers and replay loaders can
 * still display *something* meaningful, even if the payload is empty.
 */
function toGenericSnapshot(entity: Entity): GenericEntitySnapshot {
  return {
    id: entity.id,
    kind: 'generic',
    type: entity.type,
  }
}
