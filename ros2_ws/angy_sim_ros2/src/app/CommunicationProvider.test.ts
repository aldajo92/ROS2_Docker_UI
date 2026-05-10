import { describe, expect, it } from 'vitest'
import {
  resolveEnabledTwistBindings,
  type Ros2TwistTopicBindingState,
} from './CommunicationProvider'

const enabledBinding: Ros2TwistTopicBindingState = {
  topic: '/cmd_vel',
  vehicleId: 'ego',
  enabled: true,
}

const disabledBinding: Ros2TwistTopicBindingState = {
  topic: '/cmd_vel',
  vehicleId: 'ego',
  enabled: false,
}

const bindingWithoutEnabledFlag: Ros2TwistTopicBindingState = {
  topic: '/cmd_vel',
  vehicleId: 'ego',
}

describe('resolveEnabledTwistBindings', () => {
  // Core fix: rosbridge transport selection alone must not enable
  // vehicle control. The resolver is the single chokepoint between
  // the prop and the bridge-creation loop, so this is what proves
  // "empty in → empty out" — no implicit /cmd_vel → ego fallback.
  it('returns no bindings when input is undefined', () => {
    expect(resolveEnabledTwistBindings(undefined)).toEqual([])
  })

  it('returns no bindings when input is empty', () => {
    expect(resolveEnabledTwistBindings([])).toEqual([])
  })

  it('returns the binding when it is enabled', () => {
    const result = resolveEnabledTwistBindings([enabledBinding])
    expect(result).toEqual([enabledBinding])
  })

  it('drops a binding marked enabled: false', () => {
    expect(resolveEnabledTwistBindings([disabledBinding])).toEqual([])
  })

  it('treats a missing enabled flag as enabled (per scenario JSON convention)', () => {
    const result = resolveEnabledTwistBindings([bindingWithoutEnabledFlag])
    expect(result).toEqual([bindingWithoutEnabledFlag])
  })

  it('keeps only the enabled subset when both kinds are present', () => {
    const result = resolveEnabledTwistBindings([
      enabledBinding,
      disabledBinding,
      { topic: '/cmd_vel_alt', vehicleId: 'ego2', enabled: true },
    ])
    expect(result).toEqual([
      enabledBinding,
      { topic: '/cmd_vel_alt', vehicleId: 'ego2', enabled: true },
    ])
  })

  it('does not mutate the input array', () => {
    const input: Ros2TwistTopicBindingState[] = [enabledBinding, disabledBinding]
    const before = JSON.stringify(input)
    resolveEnabledTwistBindings(input)
    expect(JSON.stringify(input)).toBe(before)
  })
})
