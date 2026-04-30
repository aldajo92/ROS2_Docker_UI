import {
  RENDERER_LABELS,
  type RendererType,
} from './viewport/RendererType'

export interface RendererPanelProps {
  /** Currently active renderer adapter. Owned by the App; the panel
   *  only reads it and emits change events. */
  rendererType: RendererType
  /** Notified when the user picks a different renderer. The App
   *  swaps which viewport is mounted; the engine is untouched. */
  onRendererTypeChange: (next: RendererType) => void
}

/** Order of renderer options in the dropdown. */
const RENDERER_OPTIONS: readonly RendererType[] = ['three', 'phaser']

/**
 * Standalone "Renderer" card containing the renderer-adapter picker.
 *
 * Lives in its own panel (separate from `ControlPanel` and
 * `RendererSettingsPanel`) so the user can swap renderer engines
 * without scrolling past the simulation controls.
 */
export function RendererPanel({
  rendererType,
  onRendererTypeChange,
}: Readonly<RendererPanelProps>) {
  return (
    <section className="panel renderer-panel" aria-label="Renderer">
      <h2>Renderer</h2>
      <div className="renderer-picker">
        <label className="renderer-picker-label" htmlFor="renderer-select">
          Engine
        </label>
        <select
          id="renderer-select"
          value={rendererType}
          onChange={(event) =>
            onRendererTypeChange(event.target.value as RendererType)
          }
        >
          {RENDERER_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {RENDERER_LABELS[option]}
            </option>
          ))}
        </select>
      </div>
    </section>
  )
}
