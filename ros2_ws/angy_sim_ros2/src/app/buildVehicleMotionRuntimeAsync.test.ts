import { describe, expect, it } from 'vitest'
import { buildVehicleMotionRuntimeAsync } from './buildVehicleMotionRuntimeAsync'
import { KinematicVehicleMotionRuntime } from '../simulation/physics/KinematicVehicleMotionRuntime'
import { RapierVehicleMotionRuntime } from '../infrastructure/physics/rapier/RapierVehicleMotionRuntime'

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

  it('remote throws not-implemented error', async () => {
    await expect(buildVehicleMotionRuntimeAsync({ type: 'remote' })).rejects.toThrow(
      'Vehicle motion runtime "remote" is not implemented yet.',
    )
  })
})
