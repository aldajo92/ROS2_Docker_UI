import type { KeyboardControlUiState } from './KeyboardControlState'
import { useKeyboardVehicleControl } from './useKeyboardVehicleControl'

export interface SimulatorKeyboardControlsProps {
  /** Live keyboard-control state owned by the App shell. Updated by
   *  the Inspector and seeded from `scenario.interaction.keyboardControl`
   *  on scenario load. The hook re-runs its effect whenever any field
   *  changes, so toggling `enabled`, swapping `vehicleId`, or tuning
   *  speeds takes effect immediately. */
  state: KeyboardControlUiState
}

/**
 * Headless component: forwards the App's keyboard-control state into
 * `useKeyboardVehicleControl`. Renders nothing; existing only so the
 * hook has a stable host inside the React tree.
 */
export function SimulatorKeyboardControls({
  state,
}: SimulatorKeyboardControlsProps) {
  useKeyboardVehicleControl({
    enabled: state.enabled,
    vehicleId: state.vehicleId,
    forwardSpeed: state.forwardSpeed,
    reverseSpeed: state.reverseSpeed,
    angularSpeed: state.angularSpeed,
  })
  return null
}
