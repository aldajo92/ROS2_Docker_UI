import type { LidarScan2D } from './LidarScan2D'

/**
 * Stores the latest {@link LidarScan2D} for each sensor. Mirrors the
 * `PathRegistry` / `PoseArrayRegistry` pattern: Map-backed, upsert on
 * `add`, snapshot via `toArray`.
 *
 * Owned exclusively by `SimulationState`. Renderers read via
 * `toArray()`; only `LidarSensorSystem` and replay restore write to it.
 */
export class LidarScanRegistry {
  private readonly scans = new Map<string, LidarScan2D>()

  /** Upsert a scan. Replaces any existing scan with the same `id`. */
  add(scan: LidarScan2D): void {
    this.scans.set(scan.id, scan)
  }

  remove(id: string): void {
    this.scans.delete(id)
  }

  get(id: string): LidarScan2D | undefined {
    return this.scans.get(id)
  }

  has(id: string): boolean {
    return this.scans.has(id)
  }

  /** Returns a fresh array snapshot. Does not expose internal Map refs. */
  toArray(): LidarScan2D[] {
    return [...this.scans.values()]
  }

  clear(): void {
    this.scans.clear()
  }

  size(): number {
    return this.scans.size
  }
}
