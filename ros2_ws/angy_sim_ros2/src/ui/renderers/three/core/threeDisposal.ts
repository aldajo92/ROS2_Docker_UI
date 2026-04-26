import * as THREE from 'three'

/**
 * Walk an `Object3D` graph and dispose every GPU-backed resource it
 * holds: geometries, materials (incl. material arrays for multi-mat
 * meshes), and any textures attached to those materials.
 *
 * Three.js does NOT auto-free GPU resources on `scene.remove(obj)` —
 * forgetting this leaks a buffer per geometry/material/texture every
 * time an entity is added then removed. With the registry-based
 * lifecycle in our sub-renderers, that adds up fast.
 */
export function disposeObject3D(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.geometry) {
      mesh.geometry.dispose()
    }

    const material = mesh.material
    if (Array.isArray(material)) {
      for (const item of material) {
        disposeMaterial(item)
      }
    } else if (material) {
      disposeMaterial(material)
    }
  })
}

/**
 * Dispose a single material plus any texture maps it references.
 * We cover the common map slots (`map`, `normalMap`, `roughnessMap`,
 * `metalnessMap`, `aoMap`, `emissiveMap`, `alphaMap`); custom shaders
 * with bespoke uniforms are the caller's responsibility.
 */
function disposeMaterial(material: THREE.Material): void {
  const slots = [
    'map',
    'normalMap',
    'roughnessMap',
    'metalnessMap',
    'aoMap',
    'emissiveMap',
    'alphaMap',
  ] as const

  for (const slot of slots) {
    const tex = (material as unknown as Record<string, unknown>)[slot]
    if (tex && tex instanceof THREE.Texture) {
      tex.dispose()
    }
  }

  material.dispose()
}
