import type { TrajectoryDebugRecord } from './TrajectoryDebugRecord'

export class TrajectoryDebugRecorder {
  private enabled = false
  private readonly records: TrajectoryDebugRecord[] = []
  private readonly maxRecords: number

  constructor(maxRecords = 50000) {
    this.maxRecords = Math.max(1, Math.floor(maxRecords))
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  isEnabled(): boolean {
    return this.enabled
  }

  clear(): void {
    this.records.length = 0
  }

  record(record: TrajectoryDebugRecord): void {
    if (!this.enabled) return
    this.records.push({ ...record })
    while (this.records.length > this.maxRecords) {
      this.records.shift()
    }
  }

  getRecords(): TrajectoryDebugRecord[] {
    return this.records.map((record) => ({ ...record }))
  }
}
