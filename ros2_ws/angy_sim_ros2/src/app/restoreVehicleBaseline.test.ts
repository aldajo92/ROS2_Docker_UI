import { describe, expect, it } from 'vitest'
import { buildBaselineVehicleCommand } from './restoreVehicleBaseline'
import type { ScenarioSpec } from '../simulation/scenarios/Scenario'

const scenarioWithEgoControls: ScenarioSpec = {
  name: 'test',
  entities: [
    {
      kind: 'vehicle',
      id: 'ego',
      pose: { x: 0, y: 0, yaw: 0 },
      controls: { v: 0.5, w: 0.2 },
    },
  ],
}

const scenarioWithEgoNoControls: ScenarioSpec = {
  name: 'test',
  entities: [
    {
      kind: 'vehicle',
      id: 'ego',
      pose: { x: 0, y: 0, yaw: 0 },
    },
  ],
}

const scenarioWithEgoPartialControls: ScenarioSpec = {
  name: 'test',
  entities: [
    {
      kind: 'vehicle',
      id: 'ego',
      pose: { x: 0, y: 0, yaw: 0 },
      controls: { v: 0.5 },
    },
  ],
}

describe('buildBaselineVehicleCommand', () => {
  // Headline scenario from the bug spec: deselecting /cmd_vel for
  // vehicle "ego" with scenario controls { v: 0.5, w: 0.2 } must queue
  // a restore command with those exact values.
  it('returns scenario controls when the vehicle declares them', () => {
    const result = buildBaselineVehicleCommand(scenarioWithEgoControls, 'ego')
    expect(result.command).toEqual({
      vehicleId: 'ego',
      linearVelocity: 0.5,
      angularVelocity: 0.2,
      source: 'scenario',
    })
    expect(result.fromScenarioControls).toBe(true)
  })

  // Second headline scenario: deselect with no scenario controls →
  // zero velocities (the safe "stop" default — not a hardcoded
  // constant velocity).
  it('returns zero velocities when the vehicle has no controls field', () => {
    const result = buildBaselineVehicleCommand(
      scenarioWithEgoNoControls,
      'ego',
    )
    expect(result.command).toEqual({
      vehicleId: 'ego',
      linearVelocity: 0,
      angularVelocity: 0,
      source: 'scenario',
    })
    expect(result.fromScenarioControls).toBe(false)
  })

  it('defaults missing v / w to 0 when only one is declared', () => {
    const result = buildBaselineVehicleCommand(
      scenarioWithEgoPartialControls,
      'ego',
    )
    expect(result.command.linearVelocity).toBe(0.5)
    expect(result.command.angularVelocity).toBe(0)
    expect(result.fromScenarioControls).toBe(true)
  })

  it('returns zero velocities when the scenario is undefined', () => {
    const result = buildBaselineVehicleCommand(undefined, 'ego')
    expect(result.command.linearVelocity).toBe(0)
    expect(result.command.angularVelocity).toBe(0)
    expect(result.fromScenarioControls).toBe(false)
  })

  it('returns zero velocities when the vehicle is missing from the scenario', () => {
    const result = buildBaselineVehicleCommand(
      scenarioWithEgoControls,
      'nonexistent',
    )
    expect(result.command.linearVelocity).toBe(0)
    expect(result.command.angularVelocity).toBe(0)
    expect(result.fromScenarioControls).toBe(false)
  })

  it('ignores non-vehicle entities with the same id', () => {
    const scenario: ScenarioSpec = {
      name: 'test',
      entities: [
        {
          kind: 'static_obstacle',
          id: 'ego',
          shape: 'circle',
          position: { x: 1, y: 1 },
          radius: 0.5,
        },
        {
          kind: 'vehicle',
          id: 'ego2',
          pose: { x: 0, y: 0, yaw: 0 },
          controls: { v: 1.0, w: 0.5 },
        },
      ],
    }
    const result = buildBaselineVehicleCommand(scenario, 'ego')
    expect(result.command.linearVelocity).toBe(0)
    expect(result.command.angularVelocity).toBe(0)
    expect(result.fromScenarioControls).toBe(false)
  })
})
