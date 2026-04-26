import type { SimulationState } from '../core/SimulationState'
import type { SimulationSystem } from './SimulationSystem'
import { VehicleEntity } from '../entities/VehicleEntity'
import { StaticObstacleEntity } from '../entities/StaticObstacleEntity'
import { DynamicActorEntity } from '../entities/DynamicActorEntity'

/**
 * Naive O(n²) circle-vs-circle collision check.
 *
 * Pairs that *start* overlapping fire a `collision` event once and
 * bump the counter. They do not re-fire every tick while still in
 * contact — the system tracks active pairs and only counts the
 * leading edge. When pairs separate they're eligible again.
 *
 * For larger scenes swap in a spatial hash; the entity API doesn't
 * change.
 */
export class CollisionSystem implements SimulationSystem {
  readonly name = 'collision'

  private active = new Set<string>()

  update(_dt: number, state: SimulationState): void {
    const next = new Set<string>()
    const vehicles = state.entities.byType<VehicleEntity>('vehicle')
    const staticObs = state.entities.byType<StaticObstacleEntity>('static_obstacle')
    const dynamics = state.entities.byType<DynamicActorEntity>('dynamic_actor')

    for (const v of vehicles) {
      const vx = v.pose.position.x
      const vy = v.pose.position.y
      for (const o of staticObs) {
        if (overlap(vx, vy, v.radius, o.position.x, o.position.y, o.radius)) {
          this.recordPair(v.id, o.id, state, next)
        }
      }
      for (const d of dynamics) {
        if (overlap(vx, vy, v.radius, d.pose.position.x, d.pose.position.y, d.radius)) {
          this.recordPair(v.id, d.id, state, next)
        }
      }
    }

    for (let i = 0; i < vehicles.length; i++) {
      for (let j = i + 1; j < vehicles.length; j++) {
        const a = vehicles[i]
        const b = vehicles[j]
        if (
          overlap(
            a.pose.position.x,
            a.pose.position.y,
            a.radius,
            b.pose.position.x,
            b.pose.position.y,
            b.radius,
          )
        ) {
          this.recordPair(a.id, b.id, state, next)
        }
      }
    }

    this.active = next
  }

  private recordPair(
    a: string,
    b: string,
    state: SimulationState,
    next: Set<string>,
  ): void {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`
    next.add(key)
    if (!this.active.has(key)) {
      state.metrics.collisionCount += 1
      state.events.emit('collision', { a, b, time: state.clock.time() })
    }
  }
}

function overlap(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number,
): boolean {
  const dx = ax - bx
  const dy = ay - by
  const r = ar + br
  return dx * dx + dy * dy < r * r
}
