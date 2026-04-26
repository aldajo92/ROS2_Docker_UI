import type { Path2D } from './Path2D'

export class PathRegistry {
  private readonly paths = new Map<string, Path2D>()

  add(path: Path2D): void {
    this.paths.set(path.id, path)
  }

  remove(id: string): void {
    this.paths.delete(id)
  }

  get(id: string): Path2D | undefined {
    return this.paths.get(id)
  }

  has(id: string): boolean {
    return this.paths.has(id)
  }

  toArray(): Path2D[] {
    return [...this.paths.values()]
  }

  clear(): void {
    this.paths.clear()
  }

  size(): number {
    return this.paths.size
  }
}
