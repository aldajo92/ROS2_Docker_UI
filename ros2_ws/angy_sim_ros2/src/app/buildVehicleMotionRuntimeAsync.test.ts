import { describe, expect, it } from 'vitest'
import { buildVehicleMotionRuntimeAsync } from './buildVehicleMotionRuntimeAsync'
import { KinematicVehicleMotionRuntime } from '../simulation/physics/KinematicVehicleMotionRuntime'
import { RapierVehicleMotionRuntime } from '../infrastructure/physics/rapier/RapierVehicleMotionRuntime'
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
