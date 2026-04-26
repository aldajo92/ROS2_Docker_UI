import * as THREE from 'three'

/**
 * Imperative analogue of angelos's React `<Arrow>` primitive: a
 * shaft + cone group oriented along its **local +X**, so it composes
 * naturally with parent rotations regardless of frame.
 *
 * Lives in `objects/` because it's shared by both the heading-arrow
 * debug renderer and the world-axes renderer; centralizing it keeps
 * proportions consistent and avoids duplicating the cylinder /
 * cone construction code in two places.
 *
 * Geometry layout, all along local +X:
 *
 *   [shaftStartX] ─── shaft (cylinder, radius=shaftRadius) ───▶
 *                                                              ▲
 *                                                              tip cone (tipRadius, tipLength)
 *
 * The total reach (from the group's origin to the cone's tip) is
 * `shaftStartX + length`. `length` includes the tip — matching the
 * angelos `<Arrow>` semantics where `length` is the full arrow.
 */
export interface CreateArrowOptions {
  /** Total arrow length (shaft + tip). */
  length: number
  /** Shaft cylinder radius. */
  shaftRadius: number
  /** Tip cone radius (typically larger than the shaft). */
  tipRadius: number
  /** Tip cone length. Must be < `length`. */
  tipLength: number
  /** Body color (single color for both shaft and tip; angelos used the
   *  same color across both pieces, so we keep it that way). */
  color: number
  /** Use unlit `MeshBasicMaterial` instead of `MeshStandardMaterial`.
   *  Defaults to `false` (match angelos's lit Standard material so
   *  arrows pick up shading from the scene lights). */
  unlit?: boolean
  /** Optional offset along local +X for the shaft start. Useful for
   *  attaching the arrow to a feature like a vehicle's front bumper
   *  without adding an outer transform. Defaults to `0`. */
  shaftStartX?: number
}

/**
 * Build the arrow group. The caller owns the group: add it to a
 * scene, rotate / translate it, and dispose it via the standard
 * `disposeObject3D` helper when removing it.
 */
export function createArrow(options: CreateArrowOptions): THREE.Group {
  const {
    length,
    shaftRadius,
    tipRadius,
    tipLength,
    color,
    unlit = false,
    shaftStartX = 0,
  } = options

  const shaftLength = Math.max(0, length - tipLength)
  const group = new THREE.Group()
  group.name = 'arrow'

  const Material = unlit ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial

  // Cylinder is built along three's +Y by default; rotate -π/2 about
  // +Z to lay it along local +X (same pattern angelos used in JSX).
  const shaftGeo = new THREE.CylinderGeometry(
    shaftRadius,
    shaftRadius,
    shaftLength,
    8,
  )
  shaftGeo.rotateZ(-Math.PI / 2)
  shaftGeo.translate(shaftStartX + shaftLength / 2, 0, 0)
  const shaft = new THREE.Mesh(shaftGeo, new Material({ color }))
  shaft.name = 'arrow-shaft'
  group.add(shaft)

  const tipGeo = new THREE.ConeGeometry(tipRadius, tipLength, 8)
  tipGeo.rotateZ(-Math.PI / 2)
  tipGeo.translate(shaftStartX + shaftLength + tipLength / 2, 0, 0)
  const tip = new THREE.Mesh(tipGeo, new Material({ color }))
  tip.name = 'arrow-tip'
  group.add(tip)

  return group
}
