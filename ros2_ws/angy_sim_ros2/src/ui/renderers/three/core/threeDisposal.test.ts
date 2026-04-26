import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { disposeObject3D } from './threeDisposal'

describe('disposeObject3D', () => {
  it('disposes geometry and material on a mesh', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshBasicMaterial()
    const mesh = new THREE.Mesh(geometry, material)

    const geomSpy = vi.spyOn(geometry, 'dispose')
    const matSpy = vi.spyOn(material, 'dispose')

    disposeObject3D(mesh)

    expect(geomSpy).toHaveBeenCalledTimes(1)
    expect(matSpy).toHaveBeenCalledTimes(1)
  })

  it('disposes every material in a multi-material array', () => {
    const geometry = new THREE.BoxGeometry()
    const m1 = new THREE.MeshBasicMaterial()
    const m2 = new THREE.MeshBasicMaterial()
    const mesh = new THREE.Mesh(geometry, [m1, m2])

    const s1 = vi.spyOn(m1, 'dispose')
    const s2 = vi.spyOn(m2, 'dispose')

    disposeObject3D(mesh)

    expect(s1).toHaveBeenCalledTimes(1)
    expect(s2).toHaveBeenCalledTimes(1)
  })

  it('walks children recursively', () => {
    const root = new THREE.Group()
    const childGeom = new THREE.SphereGeometry(1)
    const childMat = new THREE.MeshBasicMaterial()
    const child = new THREE.Mesh(childGeom, childMat)
    root.add(child)

    const geomSpy = vi.spyOn(childGeom, 'dispose')
    const matSpy = vi.spyOn(childMat, 'dispose')

    disposeObject3D(root)

    expect(geomSpy).toHaveBeenCalled()
    expect(matSpy).toHaveBeenCalled()
  })

  it('does not throw on objects without geometry or material', () => {
    const empty = new THREE.Group()
    expect(() => disposeObject3D(empty)).not.toThrow()
  })

  it('disposes texture maps attached to materials', () => {
    const geometry = new THREE.BoxGeometry()
    const tex = new THREE.Texture()
    const material = new THREE.MeshBasicMaterial({ map: tex })
    const mesh = new THREE.Mesh(geometry, material)

    const texSpy = vi.spyOn(tex, 'dispose')
    disposeObject3D(mesh)
    expect(texSpy).toHaveBeenCalledTimes(1)
  })
})
