import type * as THREE from 'three'

/**
 * Shared resources every Three.js sub-renderer needs. Passed by
 * reference into every constructor so each renderer can attach to the
 * scene, read the camera, and reach the DOM container — without each
 * one creating its own copy.
 *
 * Treat this as immutable: sub-renderers should not swap the camera
 * or scene. Camera mode changes go through `CameraControllerManager`,
 * which mutates the camera in place but does not replace it.
 */
export interface ThreeSceneContext {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera
  renderer: THREE.WebGLRenderer
  container: HTMLElement
}
