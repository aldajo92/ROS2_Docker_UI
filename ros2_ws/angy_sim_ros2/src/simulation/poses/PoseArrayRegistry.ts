import type { PoseArray2D } from './PoseArray2D'

export class PoseArrayRegistry {
  private readonly items = new Map<string, PoseArray2D>()

  upsert(item: PoseArray2D): void {
    this.items.set(item.id, item)
  }

  remove(id: string): void {
    this.items.delete(id)
  }

  get(id: string): PoseArray2D | undefined {
    return this.items.get(id)
  }

  has(id: string): boolean {
    return this.items.has(id)
  }

  toArray(): PoseArray2D[] {
    return [...this.items.values()]
  }

  clear(): void {
    this.items.clear()
  }

  size(): number {
    return this.items.size
  }
}
