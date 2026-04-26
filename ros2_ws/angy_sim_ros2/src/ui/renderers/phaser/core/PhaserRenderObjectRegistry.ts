import type Phaser from 'phaser'

/**
 * Maps simulation entity ids to their corresponding Phaser game objects.
 * Mirrors `ThreeRenderObjectRegistry` so the per-domain sub-renderers
 * read identically across the two renderer adapters.
 *
 * Each per-entity sub-renderer owns its own registry: lifecycle
 * (creation, sync, disposal, stale removal) is naturally per-entity-type.
 */
export class PhaserRenderObjectRegistry<
  T extends Phaser.GameObjects.GameObject = Phaser.GameObjects.GameObject,
> {
  private readonly objects = new Map<string, T>()

  get(id: string): T | undefined {
    return this.objects.get(id)
  }

  set(id: string, object: T): void {
    this.objects.set(id, object)
  }

  has(id: string): boolean {
    return this.objects.has(id)
  }

  delete(id: string): void {
    this.objects.delete(id)
  }

  entries(): IterableIterator<[string, T]> {
    return this.objects.entries()
  }

  values(): IterableIterator<T> {
    return this.objects.values()
  }

  keys(): IterableIterator<string> {
    return this.objects.keys()
  }

  size(): number {
    return this.objects.size
  }

  clear(): void {
    this.objects.clear()
  }
}
