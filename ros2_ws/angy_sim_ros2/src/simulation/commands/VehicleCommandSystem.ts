import type { SimulationSystem } from '../systems/SimulationSystem'
import type { SimulationState } from '../core/SimulationState'
import { VehicleEntity } from '../entities/VehicleEntity'
import type { VehicleCommandQueue } from './VehicleCommandQueue'

/**
 * Drains `VehicleCommandQueue` once per tick and applies each command
 * to its target vehicle via the public `setCommand` API.
 *
 * Where this runs in the tick pipeline (registered in
 * `SimulationProvider`):
 *
 *   ScenarioSystem
 *   ▶ VehicleCommandSystem  ← this runs first so commands…
 *     VehicleDynamicsSystem ← …are already on the vehicle when integrated
 *     CollisionSystem
 *     MetricsSystem
 *
 * Robustness:
 *   - Commands for missing or non-vehicle entities are silently
 *     dropped (a stray command from a stale planner shouldn't crash
 *     the sim).
 *   - The queue is always fully drained, even if every command targets
 *     an unknown entity, so producers can't accumulate stale commands.
 *
 * Architectural rules enforced:
 *   - No imports from React / DOM / Three.js / transports.
 *   - The system never inspects keyboard / network state — only the
 *     command queue. Producers (keyboard hooks, transport bridges,
 *     scenario scripts) are the ones that observe their inputs and
 *     translate them into commands.
 */
export class VehicleCommandSystem implements SimulationSystem {
  readonly name = 'vehicle_command'

  private readonly commandQueue: VehicleCommandQueue

  constructor(commandQueue: VehicleCommandQueue) {
    this.commandQueue = commandQueue
  }

  update(_dt: number, state: SimulationState): void {
    const commands = this.commandQueue.drain()
    if (commands.length === 0) return

    for (const command of commands) {
      const entity = state.entities.get(command.vehicleId)
      if (!entity || entity.type !== 'vehicle') continue
      const vehicle = entity as VehicleEntity

      vehicle.setCommand({
        linearVelocity: command.linearVelocity,
        angularVelocity: command.angularVelocity,
        throttle: command.throttle,
        brake: command.brake,
        steering: command.steering,
      })
    }
  }

  /** Drop any commands queued before a `reset` / `scenarioLoaded`
   *  event so a freshly loaded scene starts from a clean slate. */
  reset(): void {
    this.commandQueue.clear()
  }
}
