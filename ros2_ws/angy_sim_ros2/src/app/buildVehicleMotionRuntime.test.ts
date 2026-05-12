import { describe, expect, it } from 'vitest'
import { buildVehicleMotionRuntime, VehicleMotionRuntimeAsyncRequired } from './buildVehicleMotionRuntime'
import { KinematicVehicleMotionRuntime } from '../simulation/physics/KinematicVehicleMotionRuntime'
import { DEFAULT_VEHICLE_MOTION_RUNTIME_CONFIG } from '../simulation/physics/VehicleMotionRuntimeConfig'

describe('buildVehicleMotionRuntime', () => {
  it('default config builds a KinematicVehicleMotionRuntime', () => {
    const runtime = buildVehicleMotionRuntime(DEFAULT_VEHICLE_MOTION_RUNTIME_CONFIG)
    expect(runtime).toBeInstanceOf(KinematicVehicleMotionRuntime)
  })

  it('explicit kinematic config builds a KinematicVehicleMotionRuntime', () => {
    const runtime = buildVehicleMotionRuntime({ type: 'kinematic' })
    expect(runtime).toBeInstanceOf(KinematicVehicleMotionRuntime)
  })

  it('each call returns a new runtime instance', () => {
    const a = buildVehicleMotionRuntime({ type: 'kinematic' })
    const b = buildVehicleMotionRuntime({ type: 'kinematic' })
    expect(a).not.toBe(b)
  })

  it('"rapier" throws VehicleMotionRuntimeAsyncRequired', () => {
    expect(() => buildVehicleMotionRuntime({ type: 'rapier' })).toThrow(
      VehicleMotionRuntimeAsyncRequired,
    )
  })

  it('"rapier3d" throws VehicleMotionRuntimeAsyncRequired (needs WASM init)', () => {
    expect(() => buildVehicleMotionRuntime({ type: 'rapier3d' })).toThrow(
      VehicleMotionRuntimeAsyncRequired,
    )
  })

  it('"remote" throws VehicleMotionRuntimeAsyncRequired (needs async init)', () => {
    expect(() => buildVehicleMotionRuntime({ type: 'remote' })).toThrow(
      VehicleMotionRuntimeAsyncRequired,
    )
  })

  it('kinematic is unaffected by the presence of rapier3d in the switch', () => {
    // Regression guard: adding rapier3d must not alter the kinematic path.
    const runtime = buildVehicleMotionRuntime({ type: 'kinematic' })
    expect(runtime.name).toBe('kinematic')
  })
})
