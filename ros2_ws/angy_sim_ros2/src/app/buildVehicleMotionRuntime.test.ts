import { describe, expect, it } from 'vitest'
import { buildVehicleMotionRuntime } from './buildVehicleMotionRuntime'
import { KinematicVehicleMotionRuntime } from '../simulation/physics/KinematicVehicleMotionRuntime'
import { DEFAULT_VEHICLE_MOTION_RUNTIME_CONFIG } from '../simulation/physics/VehicleMotionRuntimeConfig'
import type { VehicleMotionRuntimeType } from '../simulation/physics/VehicleMotionRuntimeConfig'

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

  it.each([['rapier'], ['remote']] as [VehicleMotionRuntimeType][][])(
    '"%s" throws a clear not-implemented error',
    (type) => {
      expect(() => buildVehicleMotionRuntime({ type })).toThrow(
        `Vehicle motion runtime "${type}" is not implemented yet.`,
      )
    },
  )
})
