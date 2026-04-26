import type { ChangeEvent } from 'react'
import type { KeyboardControlUiState } from './input/KeyboardControlState'

export interface KeyboardControlPanelProps {
  state: KeyboardControlUiState
  onChange: (next: KeyboardControlUiState) => void
}

/**
 * Inspector panel for the live keyboard-control configuration.
 *
 * This panel is the runtime source of truth — it overrides whatever a
 * scenario declared via `interaction.keyboardControl` at load time.
 * All edits are immediate; no simulation restart required. The hook
 * (`useKeyboardVehicleControl`) re-subscribes its tick listener on
 * each change.
 *
 * Validation is applied here at the input boundary (the App's state
 * never sees obviously broken values).
 */
export function KeyboardControlPanel({ state, onChange }: KeyboardControlPanelProps) {
  const update = <K extends keyof KeyboardControlUiState>(
    key: K,
    value: KeyboardControlUiState[K],
  ) => {
    onChange({ ...state, [key]: value })
  }

  const onNumberInput =
    <K extends keyof KeyboardControlUiState>(
      key: K,
      sanitize: (n: number) => number,
    ) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value
      const parsed = raw === '' ? Number.NaN : Number(raw)
      if (!Number.isFinite(parsed)) return
      update(key, sanitize(parsed) as KeyboardControlUiState[K])
    }

  return (
    <section className="panel renderer-settings">
      <h2>Keyboard Control</h2>
      <div className="renderer-settings-grid">
        <label className="renderer-settings-row renderer-settings-row--checkbox">
          <input
            type="checkbox"
            checked={state.enabled}
            onChange={(e) => update('enabled', e.target.checked)}
          />
          <span>Enable keyboard control</span>
        </label>

        <label className="renderer-settings-row">
          <span>Target vehicle</span>
          <input
            type="text"
            value={state.vehicleId}
            onChange={(e) => update('vehicleId', e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        </label>

        <label className="renderer-settings-row">
          <span>Forward speed (m/s)</span>
          <input
            type="number"
            min={0}
            step={0.1}
            value={state.forwardSpeed}
            onChange={onNumberInput('forwardSpeed', (n) => Math.max(0, n))}
          />
        </label>

        <label className="renderer-settings-row">
          <span>Reverse speed (m/s)</span>
          <input
            type="number"
            min={0}
            step={0.1}
            value={state.reverseSpeed}
            onChange={onNumberInput('reverseSpeed', (n) => Math.max(0, n))}
          />
        </label>

        <label className="renderer-settings-row">
          <span>Angular speed (rad/s)</span>
          <input
            type="number"
            min={0}
            step={0.1}
            value={state.angularSpeed}
            onChange={onNumberInput('angularSpeed', (n) => Math.max(0, n))}
          />
        </label>
      </div>
    </section>
  )
}
