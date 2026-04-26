import type * as THREE from 'three'

/**
 * Maps simulation entity ids to their corresponding Three.js objects.
 *
 * Each per-entity sub-renderer owns its own registry; we don't want
 * one giant scene-wide map because the lifecycle (creation, sync,
 * disposal, stale removal) is naturally per-entity-type.
 */
export class ThreeRenderObjectRegistry<T extends THREE.Object3D = THREE.Object3D> {
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
