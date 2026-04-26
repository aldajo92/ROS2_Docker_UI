import { describe, expect, it } from 'vitest'
import { KeyboardVehicleCommandMapper } from './KeyboardVehicleCommandMapper'
import { KeyboardInputSource } from './KeyboardInputSource'

/** Minimal `KeyboardInputSource` stand-in for tests. We sidestep the
 *  real `start/stop` (which touches `window`) and mutate the
 *  internal pressed-keys set via the public `clear()` + a thin
 *  `press` helper. The real source's `isPressed` is what the mapper
 *  uses; that lookup is what we exercise. */
function makeSource(pressed: readonly string[] = []): KeyboardInputSource {
  const src = new KeyboardInputSource()
  for (const key of pressed) {
    // The source stores keys lowercased; mimic that here.
    ;(src as unknown as { pressedKeys: Set<string> }).pressedKeys.add(
      key.toLowerCase(),
    )
  }
  return src
}

const config = {
  vehicleId: 'ego',
  forwardSpeed: 2,
  reverseSpeed: 1,
  angularSpeed: 1.5,
} as const

describe('KeyboardVehicleCommandMapper', () => {
  it('produces zero velocities when no key is pressed', () => {
    const mapper = new KeyboardVehicleCommandMapper(makeSource(), config)
    const cmd = mapper.createCommand()
    expect(cmd.vehicleId).toBe('ego')
    expect(cmd.linearVelocity).toBe(0)
    expect(cmd.angularVelocity).toBe(0)
    expect(cmd.source).toBe('keyboard')
  })

  it('ArrowUp produces positive linearVelocity', () => {
    const mapper = new KeyboardVehicleCommandMapper(
      makeSource(['ArrowUp']),
      config,
    )
    expect(mapper.createCommand().linearVelocity).toBe(2)
  })

  it('ArrowDown produces negative linearVelocity', () => {
    const mapper = new KeyboardVehicleCommandMapper(
      makeSource(['ArrowDown']),
      config,
    )
    expect(mapper.createCommand().linearVelocity).toBe(-1)
  })

  it('ArrowLeft produces positive angularVelocity (CCW)', () => {
    const mapper = new KeyboardVehicleCommandMapper(
      makeSource(['ArrowLeft']),
      config,
    )
    expect(mapper.createCommand().angularVelocity).toBe(1.5)
  })

  it('ArrowRight produces negative angularVelocity (CW)', () => {
    const mapper = new KeyboardVehicleCommandMapper(
      makeSource(['ArrowRight']),
      config,
    )
    expect(mapper.createCommand().angularVelocity).toBe(-1.5)
  })

  it('IJKL keys are equivalent to the arrow keys', () => {
    const ijklCmd = new KeyboardVehicleCommandMapper(
      makeSource(['I']),
      config,
    ).createCommand()
    const arrowCmd = new KeyboardVehicleCommandMapper(
      makeSource(['ArrowUp']),
      config,
    ).createCommand()
    expect(ijklCmd.linearVelocity).toBe(arrowCmd.linearVelocity)

    expect(
      new KeyboardVehicleCommandMapper(makeSource(['k']), config).createCommand()
        .linearVelocity,
    ).toBe(-1)
    expect(
      new KeyboardVehicleCommandMapper(makeSource(['j']), config).createCommand()
        .angularVelocity,
    ).toBe(1.5)
    expect(
      new KeyboardVehicleCommandMapper(makeSource(['l']), config).createCommand()
        .angularVelocity,
    ).toBe(-1.5)
  })

  it('opposite keys cancel out', () => {
    const both = new KeyboardVehicleCommandMapper(
      makeSource(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']),
      config,
    ).createCommand()
    // forwardSpeed (2) + (-reverseSpeed (1)) = 1 — they don't perfectly
    // cancel because the speeds are asymmetric, which is intentional.
    expect(both.linearVelocity).toBe(2 - 1)
    expect(both.angularVelocity).toBe(0)
  })

  it('Up + I together still adds only one forwardSpeed (no double-count surprise)', () => {
    // The mapper checks each axis once with `||`, so both keys held
    // result in a single contribution — important for the user
    // experience: pressing Up while I happens to be repeated does not
    // double the speed.
    const cmd = new KeyboardVehicleCommandMapper(
      makeSource(['ArrowUp', 'i']),
      config,
    ).createCommand()
    expect(cmd.linearVelocity).toBe(2)
  })

  it('forwards the timestamp into the command', () => {
    const cmd = new KeyboardVehicleCommandMapper(
      makeSource(),
      config,
    ).createCommand(12.34)
    expect(cmd.timestampSec).toBe(12.34)
  })

  it('uses the configured vehicleId', () => {
    const mapper = new KeyboardVehicleCommandMapper(makeSource(), {
      ...config,
      vehicleId: 'rover',
    })
    expect(mapper.createCommand().vehicleId).toBe('rover')
  })
})
