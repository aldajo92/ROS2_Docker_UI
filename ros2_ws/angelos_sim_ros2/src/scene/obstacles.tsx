// Reusable obstacle primitives. Lives inside <WorldFrame>, so all
// coordinates are world (x forward, y left, z up).

export const OBSTACLE_RADIUS = 0.15

// Default obstacle layout shared between the main sim and any preview
// scenes that want to render the same world.
export const OBSTACLES: ReadonlyArray<readonly [number, number]> = [
  [1.6, 2.3],
  [3.0, 3.0],
  [2.0, 7.0],
  [3.0, 5.5],
  [6.0, 4.2],
  [6.0, 8.3],
  [7.0, 1.5],
  [8.0, 6.0],
]

// Single vertical pillar centered at (x, y) on the ground plane. The
// `hit` flag tints it red — used by the main sim's collision feedback.
export function Obstacle({
  x,
  y,
  hit = false,
}: {
  x: number
  y: number
  hit?: boolean
}) {
  // `cylinderGeometry` runs along the local Y axis by default; rotate
  // the mesh so its long axis aligns with world +Z (vertical pillar).
  return (
    <mesh position={[x, y, 0.25]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[OBSTACLE_RADIUS, OBSTACLE_RADIUS, 0.5, 16]} />
      <meshStandardMaterial color={hit ? '#ff4444' : '#888'} />
    </mesh>
  )
}

// Convenience wrapper for the common case of "render an array of
// obstacles, optionally tinting the ones that just collided".
export function Obstacles({
  positions,
  hits,
}: {
  positions: ReadonlyArray<readonly [number, number]>
  // Set of indices into `positions` that should be drawn as "hit".
  hits?: ReadonlySet<number>
}) {
  return (
    <>
      {positions.map(([x, y], i) => (
        <Obstacle key={i} x={x} y={y} hit={hits?.has(i)} />
      ))}
    </>
  )
}
