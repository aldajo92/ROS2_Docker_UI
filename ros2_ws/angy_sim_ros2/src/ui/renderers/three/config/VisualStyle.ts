/**
 * Centralized visual constants for the Three.js renderer.
 *
 * One file, one source of truth. Sub-renderers must not hard-code
 * colors, dimension ratios, or arrow proportions in their own modules
 * — pull them from here. This is the structural piece the previous
 * (angelos) project lacked, where colors and sizes were scattered
 * across `world.tsx`, `obstacles.tsx`, `App.tsx`, etc.
 *
 * Where the numbers come from: the values match the look of the
 * original `angelos_sim_ros2/src/scene` — vehicle box dimensions,
 * heading-arrow proportions, obstacle pillar shape, and the ROS-style
 * R/G/B axis colors. Proportions are stored as ratios over the
 * relevant entity radius so the look survives any future change in
 * default radius.
 *
 * The mapping back to angelos's literal numbers (its `CAR_RADIUS=0.3`
 * and `OBSTACLE_RADIUS=0.15`) is documented inline next to each ratio.
 */

/** Hex color (Three.js-compatible 0xRRGGBB). */
export type HexColor = number

/* -- vehicle ---------------------------------------------------------- */

export const VEHICLE_BODY_COLOR: HexColor = 0x00ffff
/** Box length / radius. Angelos: 0.5 / 0.3 ≈ 1.667 (= 5/3). */
export const VEHICLE_LENGTH_RATIO = 5 / 3
/** Box width / radius. Angelos: 0.3 / 0.3 = 1.0. */
export const VEHICLE_WIDTH_RATIO = 1.0
/** Box height / radius. Angelos: 0.3 / 0.3 = 1.0. */
export const VEHICLE_HEIGHT_RATIO = 1.0

/* -- heading arrow (and the shared arrow primitive) ------------------- */

export const HEADING_ARROW_COLOR: HexColor = 0xff3c3c
/** Arrow length / radius. Angelos: 0.55 / 0.3 ≈ 1.833 (= 11/6). */
export const ARROW_LENGTH_RATIO = 11 / 6
/** Shaft cylinder radius / vehicle radius. Angelos: 0.025 / 0.3 ≈ 0.083 (= 1/12). */
export const ARROW_SHAFT_RADIUS_RATIO = 1 / 12
/** Tip cone radius / vehicle radius. Angelos: 0.07 / 0.3 ≈ 0.233 (= 7/30). */
export const ARROW_TIP_RADIUS_RATIO = 7 / 30
/** Tip cone length / vehicle radius. Angelos: 0.18 / 0.3 = 0.6. */
export const ARROW_TIP_LENGTH_RATIO = 0.6

/* -- world axes (ROS / Gazebo convention) ---------------------------- */

/** R = X, G = Y, B = Z, right-handed. Identical to angelos's
 *  `WorldAxes` so the two simulators read the same way. */
export const AXIS_X_COLOR: HexColor = 0xff0000
export const AXIS_Y_COLOR: HexColor = 0x00cc00
export const AXIS_Z_COLOR: HexColor = 0x2a7bff
/** Each axis arrow length, in meters. Angelos default: 1.0. */
export const AXIS_LENGTH_M = 1.0
/** Shared arrow proportions for the axis trio, sized off `AXIS_LENGTH_M`
 *  rather than a vehicle radius. Tuned to read clearly against a 1 m
 *  axis without being chunkier than the heading arrow at default
 *  vehicle size. */
export const AXIS_SHAFT_RADIUS_M = 0.025
export const AXIS_TIP_RADIUS_M = 0.07
export const AXIS_TIP_LENGTH_M = 0.18
/** Tiny lift off the ground so axes don't z-fight the ground plane. */
export const AXIS_GROUND_LIFT_M = 0.02

/* -- origin marker --------------------------------------------------- */

export const ORIGIN_MARKER_COLOR: HexColor = 0x50c850
/** Side length (sim X & Y), meters. Angelos: 0.2. */
export const ORIGIN_MARKER_SIDE_M = 0.2
/** Vertical thickness (sim Z), meters. Angelos: 0.04. */
export const ORIGIN_MARKER_THICKNESS_M = 0.04

/* -- static obstacle (vertical pillar) ------------------------------- */

export const OBSTACLE_COLOR: HexColor = 0x888888
/** Drawn when an obstacle is in collision. Reserved for the future
 *  `CollisionHighlightRenderer`; currently informational. */
export const OBSTACLE_HIT_COLOR: HexColor = 0xff4444
/** Pillar height / radius. Angelos: 0.5 / 0.15 ≈ 3.333 (= 10/3). */
export const OBSTACLE_HEIGHT_RATIO = 10 / 3

/* -- vehicle trail --------------------------------------------------- */

export const TRAIL_COLOR: HexColor = 0xff5050

/* -- planned / reference path ---------------------------------------- */

/** Amber/gold line used for planned and reference paths. */
export const PATH_COLOR: HexColor = 0xf0c14a
