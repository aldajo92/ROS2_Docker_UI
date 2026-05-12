import { describe, expect, it } from 'vitest'
import { buildVehicleMotionRuntimeAsync } from './buildVehicleMotionRuntimeAsync'
import { KinematicVehicleMotionRuntime } from '../simulation/physics/KinematicVehicleMotionRuntime'
import { RapierVehicleMotionRuntime } from '../infrastructure/physics/rapier/RapierVehicleMotionRuntime'
import { Rapier3DVehicleMotionRuntime } from '../infrastructure/physics/rapier3d/Rapier3DVehicleMotionRuntime'
import { RemoteVehicleMotionRuntime } from '../infrastructure/physics/remote/RemoteVehicleMotionRuntime'

describe('buildVehicleMotionRuntimeAsync', () => {
  it('kinematic returns KinematicVehicleMotionRuntime', async () => {
    const runtime = await buildVehicleMotionRuntimeAsync({ type: 'kinematic' })
    expect(runtime).toBeInstanceOf(KinematicVehicleMotionRuntime)
  })

  it('rapier returns RapierVehicleMotionRuntime', async () => {
    const runtime = await buildVehicleMotionRuntimeAsync({ type: 'rapier' })
    expect(runtime).toBeInstanceOf(RapierVehicleMotionRuntime)
    runtime.dispose?.()
  })

  it('each rapier call returns a new instance', async () => {
    const a = await buildVehicleMotionRuntimeAsync({ type: 'rapier' })
    const b = await buildVehicleMotionRuntimeAsync({ type: 'rapier' })
    expect(a).not.toBe(b)
    a.dispose?.()
    b.dispose?.()
  })

  it('rapier3d returns Rapier3DVehicleMotionRuntime', async () => {
    const runtime = await buildVehicleMotionRuntimeAsync({ type: 'rapier3d' })
    expect(runtime).toBeInstanceOf(Rapier3DVehicleMotionRuntime)
    expect(runtime.name).toBe('rapier3d')
    runtime.dispose?.()
  })

  it('each rapier3d call returns a new instance (separate 3D worlds)', async () => {
    const a = await buildVehicleMotionRuntimeAsync({ type: 'rapier3d' })
    const b = await buildVehicleMotionRuntimeAsync({ type: 'rapier3d' })
    expect(a).not.toBe(b)
    a.dispose?.()
    b.dispose?.()
  })

  it('rapier3d does not interfere with kinematic — kinematic still works after rapier3d init', async () => {
    const r3d = await buildVehicleMotionRuntimeAsync({ type: 'rapier3d' })
    r3d.dispose?.()
    const kin = await buildVehicleMotionRuntimeAsync({ type: 'kinematic' })
    expect(kin).toBeInstanceOf(KinematicVehicleMotionRuntime)
  })

  it('remote returns RemoteVehicleMotionRuntime', async () => {
    const runtime = await buildVehicleMotionRuntimeAsync({ type: 'remote' })
    expect(runtime).toBeInstanceOf(RemoteVehicleMotionRuntime)
    runtime.dispose?.()
  })

  it('each remote call returns a new instance', async () => {
    const a = await buildVehicleMotionRuntimeAsync({ type: 'remote' })
    const b = await buildVehicleMotionRuntimeAsync({ type: 'remote' })
    expect(a).not.toBe(b)
    a.dispose?.()
    b.dispose?.()
  })
})
