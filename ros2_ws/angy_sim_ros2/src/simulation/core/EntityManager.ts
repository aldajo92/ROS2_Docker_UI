import type { Entity } from '../entities/Entity'

/**
 * Owns the `id → Entity` registry. Iteration order matches insertion
 * order (Map invariant) so simulations are deterministic given a
 * fixed scenario.
 */
export class EntityManager {
  private entities = new Map<string, Entity>()

  add(entity: Entity): void {
    if (this.entities.has(entity.id)) {
      throw new Error(`EntityManager: entity with id "${entity.id}" already exists`)
    }
    this.entities.set(entity.id, entity)
  }

  remove(id: string): boolean {
    return this.entities.delete(id)
  }

  get(id: string): Entity | undefined {
    return this.entities.get(id)
  }

  has(id: string): boolean {
    return this.entities.has(id)
  }

  /** Iterate all entities in insertion order. */
  all(): IterableIterator<Entity> {
    return this.entities.values()
  }

  /** Materialize a snapshot array (safe to mutate without affecting the manager). */
  toArray(): Entity[] {
    return [...this.entities.values()]
  }

  byType<T extends Entity>(type: string): T[] {
    const result: T[] = []
    for (const e of this.entities.values()) {
      if (e.type === type) result.push(e as T)
    }
    return result
  }

  size(): number {
    return this.entities.size
  }

  clear(): void {
    this.entities.clear()
  }
}
