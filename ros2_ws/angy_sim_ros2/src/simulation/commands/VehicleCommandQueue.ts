import type { VehicleCommand } from './VehicleCommand'

/**
 * FIFO handoff between external command producers (keyboard hooks,
 * transport bridges, scenario events, planners, …) and
 * `VehicleCommandSystem`, which drains the queue during the simulation
 * tick.
 *
 * Architectural role: this is the **only** sanctioned write path from
 * the React / DOM / network layers into vehicle behavior. Producers
 * that bypass it (writing to `vehicle.controls` or `vehicle.pose`
 * directly) violate the "engine owns the tick" rule and break
 * determinism / replay.
 *
 * The queue is intentionally dumb:
 *   - Does not know about `VehicleEntity`.
 *   - Does not validate command fields (the producing layer does).
 *   - Does not coalesce, debounce, or prioritize. Multiple commands
 *     for the same vehicle in the same tick are applied in
 *     producer-order — the last one wins because `setCommand` is
 *     "last write wins" by definition.
 */
export class VehicleCommandQueue {
  private readonly commands: VehicleCommand[] = []

  push(command: VehicleCommand): void {
    this.commands.push(command)
  }

  /**
   * Atomically remove and return all queued commands in FIFO order.
   * The returned array is a fresh copy; mutating it does not affect
   * the queue.
   */
  drain(): VehicleCommand[] {
    if (this.commands.length === 0) return []
    const drained = this.commands.slice()
    this.commands.length = 0
    return drained
  }

  clear(): void {
    this.commands.length = 0
  }

  size(): number {
    return this.commands.length
  }
}
