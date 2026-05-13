import type { SimulationSystem } from './SimulationSystem'
import type { SimulationState } from '../core/SimulationState'
import type { LidarSensorSpec } from '../sensors/LidarSensorSpec'
import type { LidarScan2D } from '../sensors/LidarScan2D'
import type { LidarRaycastShape2D } from '../sensors/LidarRaycast2D'
import { castLidarRay2D } from '../sensors/LidarRaycast2D'
import { SeededRandom } from '../sensors/SeededRandom'
import {
  applyLidarRangeNoise,
  resolveNoiseConfig,
  type ResolvedNoiseConfig,
} from '../sensors/LidarNoiseModel'
import { VehicleEntity } from '../entities/VehicleEntity'
import { StaticObstacleEntity } from '../entities/StaticObstacleEntity'
import { DynamicActorEntity } from '../entities/DynamicActorEntity'

interface SensorRuntime {
  spec: LidarSensorSpec
  noise: ResolvedNoiseConfig
  accumSec: number
  rng: SeededRandom
}

/**
 * Generates {@link LidarScan2D} values at the configured simulation-time
 * rate and writes them into `state.lidarScans`.
 *
 * Tick order: register after `VehicleDynamicsSystem` so entity poses are
 * already integrated for this tick, and before `SimulationRecorderSystem`
 * so scans are captured in the same frame that produced them.
 *
 * Non-responsibilities:
 *   - No rendering, no ROS, no DOM.
 *   - Does not publish to any transport.
 *   - Does not mutate any entity.
 *
 * Register this system under the name `'lidarSensor'` so
 * `SimulationEngine.loadScenario` can look it up by name and forward
 * the parsed sensor specs.
 */
export class LidarSensorSystem implements SimulationSystem {
  public readonly name = 'lidarSensor'

  private sensors: SensorRuntime[] = []

  /**
   * Replace the active sensor list. Called by `SimulationEngine`
   * when a scenario is loaded. A scenario without a `sensors` field
   * clears the list.
   */
  loadSpecs(specs: LidarSensorSpec[]): void {
    this.sensors = specs.map((spec) => ({
      spec,
      noise: resolveNoiseConfig(spec.noise),
      accumSec: 0,
      rng: new SeededRandom(spec.noise?.seed ?? 0),
    }))
  }

  update(dt: number, state: SimulationState): void {
    if (this.sensors.length === 0) return

    const timeSec = state.clock.time()

    for (const runtime of this.sensors) {
      const { spec } = runtime
      if (spec.enabled === false) continue

      const rateHz = spec.rateHz !== undefined && spec.rateHz > 0 ? spec.rateHz : 10
      const period = 1 / rateHz
      runtime.accumSec += dt

      if (runtime.accumSec < period) continue
      // Subtract one period so accum carries the remainder forward
      // instead of resetting to zero (avoids rate drift over time).
      runtime.accumSec -= period

      const worldPose = resolveWorldPose(spec, state)
      const shapes = buildShapes(
        state,
        spec.includeStaticObstacles !== false, // default true
        spec.includeVehicles === true,           // default false
        spec.includeDynamicActors === true,      // default false
      )

      const scan = generateScan(spec, worldPose, timeSec, shapes, runtime)
      state.lidarScans.add(scan)
    }
  }

  reset(): void {
    for (const runtime of this.sensors) {
      runtime.accumSec = 0
      runtime.rng = new SeededRandom(runtime.spec.noise?.seed ?? 0)
    }
  }
}

// ---------------------------------------------------------------------------
// Scan generation
// ---------------------------------------------------------------------------

interface WorldPose {
  x: number
  y: number
  yaw: number
}

function resolveWorldPose(
  spec: LidarSensorSpec,
  state: SimulationState,
): WorldPose {
  const lx = spec.pose?.x ?? 0
  const ly = spec.pose?.y ?? 0
  const lyaw = spec.pose?.yaw ?? 0

  if (!spec.parentEntityId) {
    return { x: lx, y: ly, yaw: lyaw }
  }

  const parent = state.entities.get(spec.parentEntityId)
  if (!parent) {
    return { x: lx, y: ly, yaw: lyaw }
  }

  // Only VehicleEntity and DynamicActorEntity carry a `pose`.
  let px = 0
  let py = 0
  let pyaw = 0
  if (parent instanceof VehicleEntity) {
    px = parent.pose.position.x
    py = parent.pose.position.y
    pyaw = parent.pose.yaw
  } else if (parent instanceof DynamicActorEntity) {
    px = parent.pose.position.x
    py = parent.pose.position.y
    pyaw = parent.pose.yaw
  }

  // Transform sensor local pose into world frame.
  const cos = Math.cos(pyaw)
  const sin = Math.sin(pyaw)
  return {
    x: px + cos * lx - sin * ly,
    y: py + sin * lx + cos * ly,
    yaw: pyaw + lyaw,
  }
}

function generateScan(
  spec: LidarSensorSpec,
  worldPose: WorldPose,
  timeSec: number,
  shapes: LidarRaycastShape2D[],
  runtime: SensorRuntime,
): LidarScan2D {
  const { rng, noise } = runtime
  const rayCount = spec.rayCount
  const angleIncrement = (spec.angleMax - spec.angleMin) / (rayCount - 1)
  const ranges: number[] = new Array(rayCount)

  for (let i = 0; i < rayCount; i++) {
    const angle = worldPose.yaw + spec.angleMin + i * angleIncrement
    const hit = castLidarRay2D(
      {
        origin: { x: worldPose.x, y: worldPose.y },
        angle,
        rangeMin: spec.rangeMin,
        rangeMax: spec.rangeMax,
      },
      shapes,
    )
    const ideal = hit !== undefined ? hit.range : spec.rangeMax
    ranges[i] = applyLidarRangeNoise(ideal, noise, rng, spec.rangeMin, spec.rangeMax)
  }

  return {
    id: spec.id,
    sensorId: spec.id,
    parentEntityId: spec.parentEntityId,
    frameId: spec.frameId,
    timeSec,
    angleMin: spec.angleMin,
    angleMax: spec.angleMax,
    angleIncrement,
    rangeMin: spec.rangeMin,
    rangeMax: spec.rangeMax,
    ranges,
    originX: worldPose.x,
    originY: worldPose.y,
    worldYaw: worldPose.yaw,
  }
}

// ---------------------------------------------------------------------------
// Shape extraction
// ---------------------------------------------------------------------------

function buildShapes(
  state: SimulationState,
  includeStatic: boolean,
  includeVehicles: boolean,
  includeDynamic: boolean,
): LidarRaycastShape2D[] {
  const shapes: LidarRaycastShape2D[] = []
  for (const entity of state.entities.toArray()) {
    if (includeStatic && entity instanceof StaticObstacleEntity) {
      const s = entity.shape
      if (s.type === 'circle') {
        shapes.push({
          kind: 'circle',
          id: entity.id,
          cx: entity.position.x,
          cy: entity.position.y,
          radius: s.radius,
        })
      } else {
        shapes.push({
          kind: 'rectangle',
          id: entity.id,
          cx: entity.position.x,
          cy: entity.position.y,
          length: s.length,
          thickness: s.thickness,
          yaw: s.yaw,
        })
      }
    }
    if (includeVehicles && entity instanceof VehicleEntity) {
      shapes.push({
        kind: 'circle',
        id: entity.id,
        cx: entity.pose.position.x,
        cy: entity.pose.position.y,
        radius: entity.radius,
      })
    }
    if (includeDynamic && entity instanceof DynamicActorEntity) {
      shapes.push({
        kind: 'circle',
        id: entity.id,
        cx: entity.pose.position.x,
        cy: entity.pose.position.y,
        radius: entity.radius ?? 0.5,
      })
    }
  }
  return shapes
}
