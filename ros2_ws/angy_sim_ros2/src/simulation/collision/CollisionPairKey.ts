/**
 * Order-independent string key for an unordered pair of entity ids.
 * Used by `CollisionSystem` to deduplicate contacts and to track which
 * pairs are currently active across ticks (so `collision` events fire
 * only on the leading edge).
 *
 * Lexicographic ordering means `collisionPairKey("a", "b") ===
 * collisionPairKey("b", "a")`.
 */
export function collisionPairKey(entityAId: string, entityBId: string): string {
  return entityAId < entityBId
    ? `${entityAId}|${entityBId}`
    : `${entityBId}|${entityAId}`
}
