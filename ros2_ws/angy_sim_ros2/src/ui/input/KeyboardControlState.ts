import type {
  KeyboardControlScenarioConfig,
  ScenarioInteractionConfig,
} from '../../simulation/scenarios/Scenario'

/**
 * Live keyboard-control configuration owned by the React shell. The
 * Inspector edits this state directly; scenario JSON only seeds the
 * initial values via `deriveKeyboardControlState`.
 *
 * The simulation core never sees this struct — it's UI configuration,
 * not engine state. Driving still flows through the standard command
 * path: keyboard events update `KeyboardInputSource`, the hook
 * samples on each tick, the mapper produces a `VehicleCommand`, and
 * the queue → `VehicleCommandSystem` applies it. Toggling `enabled`
 * just gates whether the hook subscribes to ticks at all.
 */
export interface KeyboardControlUiState {
  enabled: boolean
  vehicleId: string
  forwardSpeed: number
  reverseSpeed: number
  angularSpeed: number
}

/**
 * Defaults used when no scenario is loaded. We pick `enabled = false`
 * so a fresh page load doesn't start grabbing arrow-key events while
 * the user might be scrolling — the `keyboard-drive` scenario opts
 * in explicitly via `interaction.keyboardControl`.
 */
export const DEFAULT_KEYBOARD_CONTROL_UI_STATE: KeyboardControlUiState = {
  enabled: false,
  vehicleId: 'ego',
  forwardSpeed: 2.0,
  reverseSpeed: 1.0,
  angularSpeed: 1.0,
}

/**
 * Build a UI state from a scenario's `interaction.keyboardControl`,
 * falling back to module defaults for any field the scenario didn't
 * declare. Pass `undefined` to reset everything to defaults — this is
 * the path used when a scenario without an `interaction` block is
 * loaded.
 */
export function deriveKeyboardControlState(
  interaction: ScenarioInteractionConfig | undefined,
): KeyboardControlUiState {
  const cfg = interaction?.keyboardControl
  if (!cfg) return { ...DEFAULT_KEYBOARD_CONTROL_UI_STATE }
  return {
    enabled: cfg.enabled ?? DEFAULT_KEYBOARD_CONTROL_UI_STATE.enabled,
    vehicleId: cfg.vehicleId ?? DEFAULT_KEYBOARD_CONTROL_UI_STATE.vehicleId,
    forwardSpeed:
      cfg.forwardSpeed ?? DEFAULT_KEYBOARD_CONTROL_UI_STATE.forwardSpeed,
    reverseSpeed:
      cfg.reverseSpeed ?? DEFAULT_KEYBOARD_CONTROL_UI_STATE.reverseSpeed,
    angularSpeed:
      cfg.angularSpeed ?? DEFAULT_KEYBOARD_CONTROL_UI_STATE.angularSpeed,
  }
}

// Re-exported so callers can construct interaction configs without a
// separate import path.
export type { KeyboardControlScenarioConfig, ScenarioInteractionConfig }
