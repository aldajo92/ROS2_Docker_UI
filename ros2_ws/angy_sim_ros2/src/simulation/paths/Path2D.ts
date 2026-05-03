import type { PathPoint2D } from './PathPoint2D'

export type Path2D = {
  id: string;
  name?: string;
  frameId?: 'map' | 'world' | string;
  vehicleId?: string;
  points: PathPoint2D[];
  metadata?: Record<string, unknown>;
  /** Hex color string, e.g. '#f0c14a'. When absent renderers use their default. */
  color?: string;
  /** Line thickness in renderer-specific units. When absent renderers use their default. */
  thickness?: number;
};
