import { Pose2D } from '../../math/geometry/Pose2D'
import { Point2D } from '../../math/geometry/Point2D'
import { Vector2D } from '../../math/geometry/Vector2D'
import { EntityManager } from '../core/EntityManager'
import { SimulationClock } from '../core/SimulationClock'
import { SimulationState } from '../core/SimulationState'
import { DynamicActorEntity } from '../entities/DynamicActorEntity'
import { StaticObstacleEntity } from '../entities/StaticObstacleEntity'
import { VehicleEntity } from '../entities/VehicleEntity'
import { TypedEventBus } from '../events/EventBus'
import type { SimulationEvents } from '../events/SimulationEvents'
import { Logger, type LoggerSink } from '../logging/Logger'
import type {
  DynamicActorEntitySnapshot,
  EntitySnapshot,
  SimulationFrameSnapshot,
  StaticObstacleEntitySnapshot,
  VehicleEntitySnapshot,
} from './SimulationFrameSnapshot'

/**
 * Returns a read-only `SimulationState`-shaped view backed by a single
 * recorded {@link SimulationFrameSnapshot}.
 *
 * Renderers consume this exactly as they consume the live state — no
 * branch is added inside the renderer code path. The adapter
 * reconstructs the public surfaces renderers actually read:
 *
 *   - `state.clock.time()` / `state.clock.dt()`
 *   - `state.entities.byType(...)` / `.all()` / `.toArray()`
 *   - `state.paths` (empty `PathRegistry`; planned-route persistence
 *     is intentionally out of scope for this version of the format)
 *   - `state.trajectories` (populated from `frame.trajectories` when
 *     present; older replay files without the field yield an empty
 *     registry, preserving backward compatibility)
 *
 * Caller contract:
 * - The returned object MUST NOT be mutated.
 * - Do not retain references across `seek*` calls — each successful
 *   seek invalidates the previously returned view.
 */
export function createReplayStateFromFrame(
  frame: SimulationFrameSnapshot,
  fixedDtSec: number,
): SimulationState {
  const targetTime = Number.isFinite(frame.timeSec) ? frame.timeSec : 0
  const dt =
    Number.isFinite(fixedDtSec) && fixedDtSec > 0 ? fixedDtSec : 0
  const clock = new SimulationClock(0)
  if (dt > 0) {
    // Two-step: rewind to (target - dt) then tick by dt so the clock
    // reports both `time() === targetTime` and `dt() === fixedDtSec`
    // exactly the way live ticks do.
    clock.reset(targetTime - dt)
    clock.tick(dt)
  } else {
    clock.reset(targetTime)
  }
  const entities = buildEntities(frame.entities)
  const events = new TypedEventBus<SimulationEvents>()
  const logger = new Logger(noopLoggerSink, 'error')

  const state = new SimulationState(clock, entities, events, logger)
  state.metrics.collisionCount = frame.metrics?.collisionCount ?? 0
  state.metrics.totalDistance = frame.metrics?.totalDistance ?? 0
  state.metrics.peakSpeed = frame.metrics?.peakSpeed ?? 0
  state.metrics.ticks = Number.isFinite(frame.tick) ? frame.tick : 0

  // Restore historical samples so the trajectory renderer paints the
  // recorded trail. `TrajectoryRegistry.add` already deep-clones each
  // entry, so renderers can't reach back through the snapshot to
  // mutate the on-disk frame.
  if (frame.trajectories) {
    for (const trajectory of frame.trajectories) {
      state.trajectories.add(trajectory)
    }
  }

  // Restore lidar scans. Replay must reproduce recorded noisy scans
  // exactly without rerunning raycasts or noise generation.
  if (frame.lidarScans) {
    for (const scan of frame.lidarScans) {
      state.lidarScans.add(scan)
    }
  }

  return state
}

const noopLoggerSink: LoggerSink = {
  write: () => {
    // Replay views are silent: no system writes here, and we don't
    // want stray prints if a renderer ever calls `state.logger`.
  },
}

function buildEntities(snapshots: readonly EntitySnapshot[]): EntityManager {
  const manager = new EntityManager()
  for (const snap of snapshots) {
    const entity = buildEntity(snap)
    if (entity) manager.add(entity)
  }
  return manager
}

function buildEntity(
  snap: EntitySnapshot,
):
  | VehicleEntity
  | StaticObstacleEntity
  | DynamicActorEntity
  | undefined {
  switch (snap.kind) {
    case 'vehicle':
      return buildVehicle(snap)
    case 'static_obstacle':
      return buildStaticObstacle(snap)
    case 'dynamic_actor':
      return buildDynamicActor(snap)
    case 'generic':
    default:
      // Generic entities have no spatial payload to reconstruct;
      // skip them rather than synthesise a fake position.
      return undefined
  }
}

function buildVehicle(snap: VehicleEntitySnapshot): VehicleEntity {
  const pose = new Pose2D(
    new Point2D(snap.pose.x, snap.pose.y),
    snap.pose.yaw,
  )
  const vehicle = new VehicleEntity({
    id: snap.id,
    pose,
    radius: snap.radius,
    controls: { v: snap.velocity?.v ?? 0, w: snap.velocity?.w ?? 0 },
  })
  vehicle.v = snap.velocity?.v ?? 0
  vehicle.w = snap.velocity?.w ?? 0
  return vehicle
}

function buildStaticObstacle(
  snap: StaticObstacleEntitySnapshot,
): StaticObstacleEntity {
  const position = new Point2D(snap.position.x, snap.position.y)
  if (snap.shape === 'rectangle' && snap.rectangle) {
    return new StaticObstacleEntity({
      id: snap.id,
      position,
      shape: {
        type: 'rectangle',
        length: snap.rectangle.length,
        thickness: snap.rectangle.thickness,
        yaw: snap.rectangle.yaw,
      },
    })
  }
  // Legacy / circle path. `radius` may be missing on very old frames;
  // default to 0 to match the pre-existing behavior.
  return new StaticObstacleEntity({
    id: snap.id,
    position,
    radius: snap.radius ?? 0,
  })
}

function buildDynamicActor(
  snap: DynamicActorEntitySnapshot,
): DynamicActorEntity {
  const px = snap.pose?.x ?? snap.position?.x ?? 0
  const py = snap.pose?.y ?? snap.position?.y ?? 0
  const yaw = snap.pose?.yaw ?? 0
  const pose = new Pose2D(new Point2D(px, py), yaw)
  return new DynamicActorEntity({
    id: snap.id,
    pose,
    velocity: new Vector2D(snap.velocity?.vx ?? 0, snap.velocity?.vy ?? 0),
    angularVelocity: snap.velocity?.w ?? 0,
    radius: snap.radius,
  })
}
