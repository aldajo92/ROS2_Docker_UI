import {
  RENDERER_LABELS,
  type RendererType,
} from './viewport/RendererType'
import type { VehicleMotionRuntimeType } from '../simulation/physics/VehicleMotionRuntimeConfig'

export interface RendererPanelProps {
  /** Currently active renderer adapter. Owned by the App; the panel
   *  only reads it and emits change events. */
  rendererType: RendererType
  /** Notified when the user picks a different renderer. The App
   *  swaps which viewport is mounted; the engine is untouched. */
  onRendererTypeChange: (next: RendererType) => void
  /** Currently selected motion runtime. Changing this remounts the engine. */
  motionRuntimeType: VehicleMotionRuntimeType
  /** Notified when the user picks a different motion runtime. */
  onMotionRuntimeTypeChange: (next: VehicleMotionRuntimeType) => void
}

/** Order of renderer options in the dropdown. */
const RENDERER_OPTIONS: readonly RendererType[] = ['three', 'phaser']

const MOTION_RUNTIME_OPTIONS: readonly VehicleMotionRuntimeType[] = [
  'kinematic',
  'rapier',
  'rapier3d',
  'remote',
]

const MOTION_RUNTIME_LABELS: Record<VehicleMotionRuntimeType, string> = {
  kinematic: 'Kinematic',
  rapier: 'Rapier (physics)',
  rapier3d: 'Rapier 3D (Experimental)',
  remote: 'Remote (Pending)',
}

/**
 * Standalone "Renderer" card containing the renderer-adapter picker and the
 * motion-runtime selector.
 *
 * Lives in its own panel (separate from `ControlPanel` and
 * `RendererSettingsPanel`) so the user can swap renderer engines
 * without scrolling past the simulation controls.
 */
export function RendererPanel({
  rendererType,
  onRendererTypeChange,
  motionRuntimeType,
  onMotionRuntimeTypeChange,
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
      <div className="renderer-picker">
        <label className="renderer-picker-label" htmlFor="motion-runtime-select">
          Motion Runtime
        </label>
        <select
          id="motion-runtime-select"
          value={motionRuntimeType}
          onChange={(event) =>
            onMotionRuntimeTypeChange(event.target.value as VehicleMotionRuntimeType)
          }
        >
          {MOTION_RUNTIME_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {MOTION_RUNTIME_LABELS[option]}
            </option>
          ))}
        </select>
      </div>
    </section>
  )
}
