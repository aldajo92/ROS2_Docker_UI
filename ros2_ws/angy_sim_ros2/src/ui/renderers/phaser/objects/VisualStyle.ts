/**
 * Centralized visual constants for the Phaser 2D renderer.
 *
 * Phaser color values are 0xRRGGBB integers (the same encoding the
 * Three.js renderer uses) — the two `VisualStyle` modules deliberately
 * keep matching numbers so vehicles, obstacles, paths, and axes look
 * the same regardless of which renderer is active. Proportions are
 * stored as ratios over the relevant entity radius so the look survives
 * any future change in default radius.
 *
 * Sub-renderers must not hard-code colors or proportions in their own
 * modules — pull them from here.
 */

/* -- vehicle ---------------------------------------------------------- */

export const VEHICLE_BODY_COLOR = 0x00ffff
/** Box length / radius. Same ratio as the 3D vehicle. */
export const VEHICLE_LENGTH_RATIO = 5 / 3
/** Box width / radius. Same ratio as the 3D vehicle. */
export const VEHICLE_WIDTH_RATIO = 1.0

/* -- heading arrow (debug overlay) ----------------------------------- */

export const HEADING_ARROW_COLOR = 0xff3c3c
/** Arrow length / radius. */
export const ARROW_LENGTH_RATIO = 11 / 6
/** Arrow tip half-width / radius. */
export const ARROW_TIP_RATIO = 7 / 30

/* -- world axes (ROS / Gazebo convention) ---------------------------- */

export const AXIS_X_COLOR = 0xff0000
export const AXIS_Y_COLOR = 0x00cc00
/** Each axis arrow length, in meters. */
export const AXIS_LENGTH_M = 1.0
/** Stroke width of the axis lines (px). */
export const AXIS_STROKE_PX = 2
/** Arrow head half-width and length (px). */
export const AXIS_TIP_PX = 8

/* -- origin marker --------------------------------------------------- */

export const ORIGIN_MARKER_COLOR = 0x50c850
/** Side length (px) of the origin marker square. */
export const ORIGIN_MARKER_SIZE_PX = 6

/* -- static obstacle ------------------------------------------------- */

export const OBSTACLE_COLOR = 0x888888
export const OBSTACLE_STROKE_COLOR = 0x444444

/* -- dynamic actor --------------------------------------------------- */

export const ACTOR_COLOR = 0x6ee06e

/* -- bounding circle (debug) ----------------------------------------- */

export const BOUNDING_CIRCLE_COLOR = 0xffd166
export const BOUNDING_CIRCLE_OPACITY = 0.7

/* -- planned / reference path ---------------------------------------- */

export const PATH_COLOR = 0xf0c14a
export const PATH_STROKE_PX = 2

/* -- grid ------------------------------------------------------------ */

export const GRID_COLOR_MINOR = 0x2a2f3a
export const GRID_COLOR_MAJOR = 0x40485a
export const GRID_STROKE_PX = 1
