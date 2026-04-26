import { useKeyboardVehicleControl } from './useKeyboardVehicleControl'

/**
 * Headless component: mounts `useKeyboardVehicleControl` for the
 * default ego vehicle. Renders nothing; existing only so the hook has
 * a stable host inside the React tree.
 *
 * If a future UI lets the user pick which vehicle to drive, this is
 * the place to thread that choice through (props or context).
 */
export function SimulatorKeyboardControls() {
  useKeyboardVehicleControl({
    enabled: true,
    vehicleId: 'ego',
    forwardSpeed: 2.0,
    reverseSpeed: 1.0,
    angularSpeed: 1.5,
  })
  return null
}
