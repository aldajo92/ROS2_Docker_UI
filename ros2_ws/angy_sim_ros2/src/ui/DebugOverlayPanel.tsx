import type {
  DebugOverlayConfig,
  VehicleBoundingOutlineShape,
} from './renderers/debug/DebugOverlayConfig'

/**
 * Inspector card exposing the shape-aware debug bounding outline
 * controls. Dumb / controlled component: owns no renderer state. The
 * parent (`App.tsx`) holds a single {@link DebugOverlayConfig} and
 * forwards it into both the Three.js and Phaser viewports via the
 * `SimulationViewportSwitcher` — changing either the checkbox or the
 * vehicle outline shape here affects whichever renderer is currently
 * mounted without recreating it.
 *
 * The panel is deliberately minimal (one checkbox + one select) so
 * the default behavior — outlines on, vehicle drawn as a circle —
 * stays one click away from the previous look.
 */
export interface DebugOverlayPanelProps {
  config: DebugOverlayConfig
  onChange: (next: DebugOverlayConfig) => void
}

const VEHICLE_SHAPE_OPTIONS: ReadonlyArray<{
  value: VehicleBoundingOutlineShape
  label: string
}> = [
  { value: 'circle', label: 'Circle (bounding radius)' },
  { value: 'rectangle', label: 'Rectangle (body footprint)' },
]

export function DebugOverlayPanel({
  config,
  onChange,
}: DebugOverlayPanelProps) {
  const patch = (partial: Partial<DebugOverlayConfig>) => {
    onChange({ ...config, ...partial })
  }

  return (
    <section className="panel debug-overlay-panel" aria-label="Debug overlay">
      <h2>Debug overlay</h2>
      <label className="debug-overlay-panel-toggle">
        <input
          type="checkbox"
          checked={config.showBoundingOutlines}
          onChange={(e) =>
            patch({ showBoundingOutlines: e.target.checked })
          }
        />
        <span>Show bounding outlines</span>
      </label>
      <div className="debug-overlay-panel-row">
        <label
          className="debug-overlay-panel-row-label"
          htmlFor="debug-overlay-panel-vehicle-shape"
        >
          Vehicle outline
        </label>
        <select
          id="debug-overlay-panel-vehicle-shape"
          className="debug-overlay-panel-select"
          value={config.vehicleBoundingOutlineShape}
          disabled={!config.showBoundingOutlines}
          onChange={(e) =>
            patch({
              vehicleBoundingOutlineShape: e.target
                .value as VehicleBoundingOutlineShape,
            })
          }
        >
          {VEHICLE_SHAPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <p className="debug-overlay-panel-hint">
        Rectangular obstacles always use a rectangular outline and
        circular obstacles / dynamic actors always use a circular
        outline, regardless of this selection. Only the vehicle
        outline is configurable. Collision shapes are unaffected.
      </p>
    </section>
  )
}
