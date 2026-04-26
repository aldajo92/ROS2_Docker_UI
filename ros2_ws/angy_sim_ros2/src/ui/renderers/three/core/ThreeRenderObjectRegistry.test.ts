import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { ThreeRenderObjectRegistry } from './ThreeRenderObjectRegistry'

describe('ThreeRenderObjectRegistry', () => {
  it('stores and retrieves objects by id', () => {
    const reg = new ThreeRenderObjectRegistry<THREE.Mesh>()
    const mesh = new THREE.Mesh()
    reg.set('a', mesh)
    expect(reg.has('a')).toBe(true)
    expect(reg.get('a')).toBe(mesh)
    expect(reg.size()).toBe(1)
  })

  it('preserves insertion order on iteration (Map invariant)', () => {
    const reg = new ThreeRenderObjectRegistry<THREE.Mesh>()
    reg.set('c', new THREE.Mesh())
    reg.set('a', new THREE.Mesh())
    reg.set('b', new THREE.Mesh())
    expect([...reg.keys()]).toEqual(['c', 'a', 'b'])
  })

  it('deletes individual entries and clears all at once', () => {
    const reg = new ThreeRenderObjectRegistry<THREE.Mesh>()
    reg.set('a', new THREE.Mesh())
    reg.set('b', new THREE.Mesh())
    reg.delete('a')
    expect(reg.has('a')).toBe(false)
    expect(reg.size()).toBe(1)
    reg.clear()
    expect(reg.size()).toBe(0)
  })
})
