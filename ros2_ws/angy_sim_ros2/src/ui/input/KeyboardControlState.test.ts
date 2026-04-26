import { describe, expect, it } from 'vitest'
import {
  DEFAULT_KEYBOARD_CONTROL_UI_STATE,
  deriveKeyboardControlState,
} from './KeyboardControlState'

describe('deriveKeyboardControlState', () => {
  it('returns defaults when interaction is undefined', () => {
    expect(deriveKeyboardControlState(undefined)).toEqual(
      DEFAULT_KEYBOARD_CONTROL_UI_STATE,
    )
  })

  it('returns defaults when keyboardControl is missing', () => {
    expect(deriveKeyboardControlState({})).toEqual(
      DEFAULT_KEYBOARD_CONTROL_UI_STATE,
    )
  })

  it('overrides only the fields the scenario declared', () => {
    const state = deriveKeyboardControlState({
      keyboardControl: { enabled: true, forwardSpeed: 5 },
    })
    expect(state.enabled).toBe(true)
    expect(state.forwardSpeed).toBe(5)
    // Defaults preserved for everything else.
    expect(state.vehicleId).toBe(DEFAULT_KEYBOARD_CONTROL_UI_STATE.vehicleId)
    expect(state.reverseSpeed).toBe(
      DEFAULT_KEYBOARD_CONTROL_UI_STATE.reverseSpeed,
    )
    expect(state.angularSpeed).toBe(
      DEFAULT_KEYBOARD_CONTROL_UI_STATE.angularSpeed,
    )
  })

  it('takes the scenario vehicleId over the default', () => {
    const state = deriveKeyboardControlState({
      keyboardControl: { vehicleId: 'rover' },
    })
    expect(state.vehicleId).toBe('rover')
  })

  it('returns a fresh copy every call (defaults are not aliased)', () => {
    const a = deriveKeyboardControlState(undefined)
    const b = deriveKeyboardControlState(undefined)
    expect(a).not.toBe(b)
    expect(a).not.toBe(DEFAULT_KEYBOARD_CONTROL_UI_STATE)
  })
})
