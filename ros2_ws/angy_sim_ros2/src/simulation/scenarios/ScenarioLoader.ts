import { Point2D } from '../../math/geometry/Point2D'
import { Pose2D } from '../../math/geometry/Pose2D'
import { Vector2D } from '../../math/geometry/Vector2D'
import { VehicleEntity } from '../entities/VehicleEntity'
import {
  StaticObstacleEntity,
  type ObstacleRectangle2D,
} from '../entities/StaticObstacleEntity'
import { DynamicActorEntity } from '../entities/DynamicActorEntity'
import type { Entity } from '../entities/Entity'
import type {
  EntitySpec,
  KeyboardControlScenarioConfig,
  PathPointSpec,
  PathSpec,
  RectangleObstacleSpec,
  ScenarioActionSpec,
  ScenarioConnectionSpec,
  ScenarioConnectionsConfig,
  ScenarioDisplaySpec,
  ScenarioInteractionConfig,
  ScenarioPublisherNoiseSpec,
  ScenarioPublisherSpec,
  ScenarioSpec,
  ScenarioTopicSource,
  StaticObstacleSpec,
} from './Scenario'
import type { LidarSensorSpec, LidarNoiseConfig } from '../sensors/LidarSensorSpec'
import type {
  EntityTrajectoryTrackingConfig,
  TrajectorySamplingMode,
  TrajectoryTrackingConfig,
} from '../trajectories/TrajectoryTrackingConfig'

export class ScenarioParseError extends Error {
  constructor(message: string) {
    super(`ScenarioParseError: ${message}`)
    this.name = 'ScenarioParseError'
  }
}

/**
 * Parses, validates, and materializes scenarios. Kept as a static
 * facade because there's no per-loader state to track — every scenario
 * load is independent.
 */
export class ScenarioLoader {
  static parse(input: unknown): ScenarioSpec {
    if (!isObj(input)) throw new ScenarioParseError('scenario must be an object')
    if (typeof input.name !== 'string') {
      throw new ScenarioParseError('scenario.name must be a string')
    }
    if (!Array.isArray(input.entities)) {
      throw new ScenarioParseError('scenario.entities must be an array')
    }
    // Reject legacy fields with a clear migration message.
    if (isObj(input.interaction) && input.interaction.ros2TwistControls !== undefined) {
      throw new ScenarioParseError(
        'scenario.interaction.ros2TwistControls is no longer supported. ' +
        'Use scenario.actions[] instead.',
      )
    }
    if (isObj(input.visualization) && input.visualization.ros2Topics !== undefined) {
      throw new ScenarioParseError(
        'scenario.visualization.ros2Topics is no longer supported. ' +
        'Use scenario.displays[] instead.',
      )
    }
    const description =
      typeof input.description === 'string' ? input.description : undefined
    const paths =
      input.paths !== undefined ? parsePaths(input.paths) : undefined
    const interaction =
      input.interaction !== undefined ? parseInteraction(input.interaction) : undefined
    const trajectoryTracking =
      input.trajectoryTracking !== undefined
        ? parseTrajectoryTracking(input.trajectoryTracking)
        : undefined
    const connections =
      input.connections !== undefined
        ? parseConnections(input.connections, 'scenario.connections')
        : undefined
    const actions =
      input.actions !== undefined
        ? parseActions(input.actions, 'scenario.actions', connections ?? {})
        : undefined
    const displays =
      input.displays !== undefined
        ? parseDisplays(input.displays, 'scenario.displays', connections ?? {})
        : undefined
    const publishers =
      input.publishers !== undefined
        ? parsePublishers(input.publishers, 'scenario.publishers', connections ?? {})
        : undefined
    const sensors =
      input.sensors !== undefined
        ? parseSensors(input.sensors, 'scenario.sensors')
        : undefined
    return {
      name: input.name,
      description,
      entities: input.entities.map((e: unknown, i: number) => parseEntity(e, i)),
      paths,
      interaction,
      trajectoryTracking,
      ...(connections !== undefined && { connections }),
      ...(actions !== undefined && { actions }),
      ...(displays !== undefined && { displays }),
      ...(publishers !== undefined && { publishers }),
      ...(sensors !== undefined && { sensors }),
    }
  }

  static async loadFromUrl(
    url: string,
    fetchFn: typeof fetch = fetch,
  ): Promise<ScenarioSpec> {
    const res = await fetchFn(url)
    if (!res.ok) {
      throw new ScenarioParseError(
        `failed to fetch scenario at ${url}: ${res.status} ${res.statusText}`,
      )
    }
    const json = (await res.json()) as unknown
    return ScenarioLoader.parse(json)
  }

  /** Build a runtime Entity from a typed spec. */
  static buildEntity(spec: EntitySpec): Entity {
    switch (spec.kind) {
      case 'vehicle':
        return new VehicleEntity({
          id: spec.id,
          pose: spec.pose
            ? Pose2D.of(spec.pose.x, spec.pose.y, spec.pose.yaw ?? 0)
            : undefined,
          controls: spec.controls
            ? { v: spec.controls.v ?? 0, w: spec.controls.w ?? 0 }
            : undefined,
          radius: spec.radius,
        })
      case 'static_obstacle':
        return buildStaticObstacleEntity(spec)
      case 'dynamic_actor':
        return new DynamicActorEntity({
          id: spec.id,
          pose: spec.pose
            ? Pose2D.of(spec.pose.x, spec.pose.y, spec.pose.yaw ?? 0)
            : undefined,
          velocity: spec.velocity
            ? new Vector2D(spec.velocity.vx ?? 0, spec.velocity.vy ?? 0)
            : undefined,
          angularVelocity: spec.velocity?.w,
          radius: spec.radius,
        })
    }
  }
}

/* ------------------------------------------------------------------------ */
/* helpers                                                                  */
/* ------------------------------------------------------------------------ */

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function requireNumber(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new ScenarioParseError(`${path} must be a finite number`)
  }
  return v
}

function optionalNumber(v: unknown, path: string): number | undefined {
  if (v === undefined) return undefined
  return requireNumber(v, path)
}

function parsePose(v: unknown, path: string): { x: number; y: number; yaw?: number } | undefined {
  if (v === undefined) return undefined
  if (!isObj(v)) throw new ScenarioParseError(`${path} must be an object`)
  return {
    x: requireNumber(v.x, `${path}.x`),
    y: requireNumber(v.y, `${path}.y`),
    yaw: optionalNumber(v.yaw, `${path}.yaw`),
  }
}

function parseControls(v: unknown, path: string): { v?: number; w?: number } | undefined {
  if (v === undefined) return undefined
  if (!isObj(v)) throw new ScenarioParseError(`${path} must be an object`)
  return {
    v: optionalNumber(v.v, `${path}.v`),
    w: optionalNumber(v.w, `${path}.w`),
  }
}

function parseVelocity(
  v: unknown,
  path: string,
): { vx?: number; vy?: number; w?: number } | undefined {
  if (v === undefined) return undefined
  if (!isObj(v)) throw new ScenarioParseError(`${path} must be an object`)
  return {
    vx: optionalNumber(v.vx, `${path}.vx`),
    vy: optionalNumber(v.vy, `${path}.vy`),
    w: optionalNumber(v.w, `${path}.w`),
  }
}

function parsePathPoint(input: unknown, pathIndex: number, pointIndex: number): PathPointSpec {
  const loc = `paths[${pathIndex}].points[${pointIndex}]`
  if (!isObj(input)) throw new ScenarioParseError(`${loc} must be an object`)
  return {
    x: requireNumber(input.x, `${loc}.x`),
    y: requireNumber(input.y, `${loc}.y`),
    yaw: optionalNumber(input.yaw, `${loc}.yaw`),
    targetVelocity: optionalNumber(input.targetVelocity, `${loc}.targetVelocity`),
    timeSec: optionalNumber(input.timeSec, `${loc}.timeSec`),
  }
}

function parsePath(input: unknown, index: number): PathSpec {
  const loc = `paths[${index}]`
  if (!isObj(input)) throw new ScenarioParseError(`${loc} must be an object`)
  if (typeof input.id !== 'string' || input.id.length === 0) {
    throw new ScenarioParseError(`${loc}.id must be a non-empty string`)
  }
  if (!Array.isArray(input.points) || input.points.length === 0) {
    throw new ScenarioParseError(`${loc}.points must be a non-empty array`)
  }
  const name = typeof input.name === 'string' ? input.name : undefined
  const frameId = typeof input.frameId === 'string' ? input.frameId : undefined
  const vehicleId = typeof input.vehicleId === 'string' ? input.vehicleId : undefined
  return {
    id: input.id,
    name,
    frameId,
    vehicleId,
    points: input.points.map((p: unknown, pi: number) => parsePathPoint(p, index, pi)),
  }
}

function parsePaths(input: unknown): PathSpec[] {
  if (!Array.isArray(input)) {
    throw new ScenarioParseError('scenario.paths must be an array')
  }
  return input.map((p: unknown, i: number) => parsePath(p, i))
}

function parseInteraction(input: unknown): ScenarioInteractionConfig {
  if (!isObj(input)) {
    throw new ScenarioParseError('scenario.interaction must be an object')
  }
  const keyboardControl =
    input.keyboardControl !== undefined
      ? parseKeyboardControl(input.keyboardControl)
      : undefined
  return {
    ...(keyboardControl !== undefined && { keyboardControl }),
  }
}

function parseRos2TwistScale(
  input: unknown,
  path: string,
): { v?: number; w?: number } {
  if (!isObj(input)) {
    throw new ScenarioParseError(`${path} must be an object`)
  }
  const v = optionalNumber(input.v, `${path}.v`)
  const w = optionalNumber(input.w, `${path}.w`)
  return {
    ...(v !== undefined && { v }),
    ...(w !== undefined && { w }),
  }
}

function parseRos2TwistLimits(
  input: unknown,
  path: string,
): {
  maxForwardSpeed?: number
  maxReverseSpeed?: number
  maxAngularSpeed?: number
} {
  if (!isObj(input)) {
    throw new ScenarioParseError(`${path} must be an object`)
  }
  const maxForwardSpeed =
    input.maxForwardSpeed !== undefined
      ? requirePositiveFinite(input.maxForwardSpeed, `${path}.maxForwardSpeed`)
      : undefined
  const maxReverseSpeed =
    input.maxReverseSpeed !== undefined
      ? requirePositiveFinite(input.maxReverseSpeed, `${path}.maxReverseSpeed`)
      : undefined
  const maxAngularSpeed =
    input.maxAngularSpeed !== undefined
      ? requirePositiveFinite(input.maxAngularSpeed, `${path}.maxAngularSpeed`)
      : undefined
  return {
    ...(maxForwardSpeed !== undefined && { maxForwardSpeed }),
    ...(maxReverseSpeed !== undefined && { maxReverseSpeed }),
    ...(maxAngularSpeed !== undefined && { maxAngularSpeed }),
  }
}

function parseKeyboardControl(input: unknown): KeyboardControlScenarioConfig {
  const path = 'scenario.interaction.keyboardControl'
  if (!isObj(input)) {
    throw new ScenarioParseError(`${path} must be an object`)
  }
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') {
    throw new ScenarioParseError(`${path}.enabled must be a boolean`)
  }
  if (input.vehicleId !== undefined && typeof input.vehicleId !== 'string') {
    throw new ScenarioParseError(`${path}.vehicleId must be a string`)
  }
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : undefined,
    // Per spec: enabled === true with no vehicleId defaults to "ego".
    vehicleId:
      typeof input.vehicleId === 'string'
        ? input.vehicleId
        : input.enabled === true
          ? 'ego'
          : undefined,
    forwardSpeed: optionalNonNegative(input.forwardSpeed, `${path}.forwardSpeed`),
    reverseSpeed: optionalNonNegative(input.reverseSpeed, `${path}.reverseSpeed`),
    angularSpeed: optionalNonNegative(input.angularSpeed, `${path}.angularSpeed`),
  }
}

function optionalNonNegative(v: unknown, path: string): number | undefined {
  if (v === undefined) return undefined
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
    throw new ScenarioParseError(`${path} must be a finite non-negative number`)
  }
  return v
}

function requireBoolean(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') {
    throw new ScenarioParseError(`${path} must be a boolean`)
  }
  return v
}

function requireIntegerAtLeast2(v: unknown, path: string): number {
  if (
    typeof v !== 'number' ||
    !Number.isFinite(v) ||
    !Number.isInteger(v) ||
    v < 2
  ) {
    throw new ScenarioParseError(`${path} must be a finite integer >= 2`)
  }
  return v
}

function requirePositiveFinite(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
    throw new ScenarioParseError(`${path} must be a finite number > 0`)
  }
  return v
}

function requireNonNegativeFinite(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
    throw new ScenarioParseError(`${path} must be a finite number >= 0`)
  }
  return v
}

function parseSamplingMode(
  v: unknown,
  path: string,
): TrajectorySamplingMode {
  if (v === 'pointCount' || v === 'timeWindow') return v
  throw new ScenarioParseError(
    `${path} must be "pointCount" or "timeWindow"`,
  )
}

function parseTrajectoryTracking(input: unknown): TrajectoryTrackingConfig {
  const path = 'scenario.trajectoryTracking'
  if (!isObj(input)) {
    throw new ScenarioParseError(`${path} must be an object`)
  }

  const enabled =
    input.enabled !== undefined
      ? requireBoolean(input.enabled, `${path}.enabled`)
      : undefined
  const trackAllSupportedEntities =
    input.trackAllSupportedEntities !== undefined
      ? requireBoolean(
          input.trackAllSupportedEntities,
          `${path}.trackAllSupportedEntities`,
        )
      : undefined
  const defaultSamplingMode =
    input.defaultSamplingMode !== undefined
      ? parseSamplingMode(input.defaultSamplingMode, `${path}.defaultSamplingMode`)
      : undefined
  const defaultMaxSamples =
    input.defaultMaxSamples !== undefined
      ? requireIntegerAtLeast2(
          input.defaultMaxSamples,
          `${path}.defaultMaxSamples`,
        )
      : undefined
  const defaultTimeWindowSec =
    input.defaultTimeWindowSec !== undefined
      ? requirePositiveFinite(
          input.defaultTimeWindowSec,
          `${path}.defaultTimeWindowSec`,
        )
      : undefined
  const defaultMinSampleDtSec =
    input.defaultMinSampleDtSec !== undefined
      ? requireNonNegativeFinite(
          input.defaultMinSampleDtSec,
          `${path}.defaultMinSampleDtSec`,
        )
      : undefined
  const defaultMinDistance =
    input.defaultMinDistance !== undefined
      ? requireNonNegativeFinite(
          input.defaultMinDistance,
          `${path}.defaultMinDistance`,
        )
      : undefined
  const entities =
    input.entities !== undefined
      ? parseTrajectoryEntities(input.entities, `${path}.entities`)
      : undefined

  return {
    ...(enabled !== undefined && { enabled }),
    ...(trackAllSupportedEntities !== undefined && {
      trackAllSupportedEntities,
    }),
    ...(defaultSamplingMode !== undefined && { defaultSamplingMode }),
    ...(defaultMaxSamples !== undefined && { defaultMaxSamples }),
    ...(defaultTimeWindowSec !== undefined && { defaultTimeWindowSec }),
    ...(defaultMinSampleDtSec !== undefined && { defaultMinSampleDtSec }),
    ...(defaultMinDistance !== undefined && { defaultMinDistance }),
    ...(entities !== undefined && { entities }),
  }
}

function parseTrajectoryEntities(
  input: unknown,
  path: string,
): EntityTrajectoryTrackingConfig[] {
  if (!Array.isArray(input)) {
    throw new ScenarioParseError(`${path} must be an array`)
  }
  return input.map((e: unknown, i: number) =>
    parseTrajectoryEntityConfig(e, i, path),
  )
}

function parseTrajectoryEntityConfig(
  input: unknown,
  index: number,
  basePath: string,
): EntityTrajectoryTrackingConfig {
  const path = `${basePath}[${index}]`
  if (!isObj(input)) throw new ScenarioParseError(`${path} must be an object`)
  if (typeof input.entityId !== 'string' || input.entityId.length === 0) {
    throw new ScenarioParseError(`${path}.entityId must be a non-empty string`)
  }

  const enabled =
    input.enabled !== undefined
      ? requireBoolean(input.enabled, `${path}.enabled`)
      : undefined
  const samplingMode =
    input.samplingMode !== undefined
      ? parseSamplingMode(input.samplingMode, `${path}.samplingMode`)
      : undefined
  const maxSamples =
    input.maxSamples !== undefined
      ? requireIntegerAtLeast2(input.maxSamples, `${path}.maxSamples`)
      : undefined
  const timeWindowSec =
    input.timeWindowSec !== undefined
      ? requirePositiveFinite(input.timeWindowSec, `${path}.timeWindowSec`)
      : undefined
  const minSampleDtSec =
    input.minSampleDtSec !== undefined
      ? requireNonNegativeFinite(input.minSampleDtSec, `${path}.minSampleDtSec`)
      : undefined
  const minDistance =
    input.minDistance !== undefined
      ? requireNonNegativeFinite(input.minDistance, `${path}.minDistance`)
      : undefined

  return {
    entityId: input.entityId,
    ...(enabled !== undefined && { enabled }),
    ...(samplingMode !== undefined && { samplingMode }),
    ...(maxSamples !== undefined && { maxSamples }),
    ...(timeWindowSec !== undefined && { timeWindowSec }),
    ...(minSampleDtSec !== undefined && { minSampleDtSec }),
    ...(minDistance !== undefined && { minDistance }),
  }
}

/* -- connections / actions / displays ----------------------------------- */

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

const TWIST_MESSAGE_TYPE = 'geometry_msgs/msg/Twist'
const DISPLAY_MESSAGE_TYPES = new Set(['nav_msgs/msg/Path', 'geometry_msgs/msg/PoseArray'])

function parseConnections(
  input: unknown,
  path: string,
): ScenarioConnectionsConfig {
  if (!isObj(input)) {
    throw new ScenarioParseError(`${path} must be an object`)
  }
  const result: ScenarioConnectionsConfig = {}
  for (const [id, spec] of Object.entries(input)) {
    if (id.length === 0) {
      throw new ScenarioParseError(`${path} connection id must be a non-empty string`)
    }
    result[id] = parseConnectionSpec(spec, `${path}.${id}`)
  }
  return result
}

function parseConnectionSpec(
  input: unknown,
  path: string,
): ScenarioConnectionSpec {
  if (!isObj(input)) {
    throw new ScenarioParseError(`${path} must be an object`)
  }
  if (input.kind !== 'rosbridge') {
    throw new ScenarioParseError(`${path}.kind must be "rosbridge"`)
  }
  const url =
    input.url !== undefined
      ? (typeof input.url === 'string'
          ? input.url
          : (() => { throw new ScenarioParseError(`${path}.url must be a string`) })())
      : undefined
  return {
    kind: 'rosbridge',
    ...(url !== undefined && { url }),
  }
}

function parseTopicSource(
  input: unknown,
  path: string,
  connections: ScenarioConnectionsConfig,
): ScenarioTopicSource {
  if (!isObj(input)) {
    throw new ScenarioParseError(`${path} must be an object`)
  }
  if (typeof input.connection !== 'string' || input.connection.length === 0) {
    throw new ScenarioParseError(`${path}.connection must be a non-empty string`)
  }
  if (!(input.connection in connections)) {
    throw new ScenarioParseError(
      `${path}.connection "${input.connection}" is not declared in scenario.connections`,
    )
  }
  if (typeof input.topic !== 'string' || input.topic.length === 0) {
    throw new ScenarioParseError(`${path}.topic must be a non-empty string`)
  }
  if (typeof input.messageType !== 'string' || input.messageType.length === 0) {
    throw new ScenarioParseError(`${path}.messageType must be a non-empty string`)
  }
  return {
    connection: input.connection,
    topic: input.topic,
    messageType: input.messageType,
  }
}

function parseActions(
  input: unknown,
  path: string,
  connections: ScenarioConnectionsConfig,
): ScenarioActionSpec[] {
  if (!Array.isArray(input)) {
    throw new ScenarioParseError(`${path} must be an array`)
  }
  return input.map((entry, i) => parseActionSpec(entry, `${path}[${i}]`, connections))
}

function parseActionSpec(
  input: unknown,
  path: string,
  connections: ScenarioConnectionsConfig,
): ScenarioActionSpec {
  if (!isObj(input)) {
    throw new ScenarioParseError(`${path} must be an object`)
  }
  const source = parseTopicSource(input.source, `${path}.source`, connections)
  if (source.messageType !== TWIST_MESSAGE_TYPE) {
    throw new ScenarioParseError(
      `${path}.source.messageType "${source.messageType}" is not supported in actions[]. ` +
      `Only "${TWIST_MESSAGE_TYPE}" is valid here.`,
    )
  }
  if (!isObj(input.target)) {
    throw new ScenarioParseError(`${path}.target must be an object`)
  }
  if (input.target.kind !== 'vehicle') {
    throw new ScenarioParseError(`${path}.target.kind must be "vehicle"`)
  }
  if (typeof input.target.id !== 'string' || input.target.id.length === 0) {
    throw new ScenarioParseError(`${path}.target.id must be a non-empty string`)
  }
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') {
    throw new ScenarioParseError(`${path}.enabled must be a boolean`)
  }
  const scale =
    input.scale !== undefined
      ? parseRos2TwistScale(input.scale, `${path}.scale`)
      : undefined
  const limits =
    input.limits !== undefined
      ? parseRos2TwistLimits(input.limits, `${path}.limits`)
      : undefined
  const timeoutSec =
    input.timeoutSec !== undefined
      ? requirePositiveFinite(input.timeoutSec, `${path}.timeoutSec`)
      : undefined
  let onTimeout: 'stop' | undefined
  if (input.onTimeout !== undefined) {
    if (input.onTimeout !== 'stop') {
      throw new ScenarioParseError(`${path}.onTimeout must be "stop"`)
    }
    onTimeout = 'stop'
  }
  return {
    source,
    target: { kind: 'vehicle', id: input.target.id as string },
    ...(typeof input.enabled === 'boolean' && { enabled: input.enabled }),
    ...(scale !== undefined && { scale }),
    ...(limits !== undefined && { limits }),
    ...(timeoutSec !== undefined && { timeoutSec }),
    ...(onTimeout !== undefined && { onTimeout }),
  }
}

function parseDisplays(
  input: unknown,
  path: string,
  connections: ScenarioConnectionsConfig,
): ScenarioDisplaySpec[] {
  if (!Array.isArray(input)) {
    throw new ScenarioParseError(`${path} must be an array`)
  }
  return input.map((entry, i) => parseDisplaySpec(entry, `${path}[${i}]`, connections))
}

function parseDisplaySpec(
  input: unknown,
  path: string,
  connections: ScenarioConnectionsConfig,
): ScenarioDisplaySpec {
  if (!isObj(input)) {
    throw new ScenarioParseError(`${path} must be an object`)
  }
  const source = parseTopicSource(input.source, `${path}.source`, connections)
  if (!DISPLAY_MESSAGE_TYPES.has(source.messageType)) {
    throw new ScenarioParseError(
      `${path}.source.messageType "${source.messageType}" is not supported in displays[]. ` +
      `Valid types: ${[...DISPLAY_MESSAGE_TYPES].map((t) => `"${t}"`).join(', ')}.`,
    )
  }
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') {
    throw new ScenarioParseError(`${path}.enabled must be a boolean`)
  }
  const style =
    input.style !== undefined
      ? parseDisplayStyle(input.style, `${path}.style`)
      : undefined
  return {
    source,
    ...(typeof input.enabled === 'boolean' && { enabled: input.enabled }),
    ...(style !== undefined && { style }),
  }
}

function parseDisplayStyle(
  input: unknown,
  path: string,
): ScenarioDisplaySpec['style'] {
  if (!isObj(input)) {
    throw new ScenarioParseError(`${path} must be an object`)
  }
  let color: string | undefined
  if (input.color !== undefined) {
    if (typeof input.color !== 'string' || !HEX_COLOR_RE.test(input.color)) {
      throw new ScenarioParseError(`${path}.color must match #RRGGBB hex format`)
    }
    color = input.color
  }
  let thickness: number | undefined
  if (input.thickness !== undefined) {
    if (
      typeof input.thickness !== 'number' ||
      !Number.isFinite(input.thickness) ||
      input.thickness <= 0
    ) {
      throw new ScenarioParseError(`${path}.thickness must be a finite number > 0`)
    }
    thickness = input.thickness
  }
  let arrowSize: number | undefined
  if (input.arrowSize !== undefined) {
    if (
      typeof input.arrowSize !== 'number' ||
      !Number.isFinite(input.arrowSize) ||
      input.arrowSize <= 0
    ) {
      throw new ScenarioParseError(`${path}.arrowSize must be a finite number > 0`)
    }
    arrowSize = input.arrowSize
  }
  return {
    ...(color !== undefined && { color }),
    ...(thickness !== undefined && { thickness }),
    ...(arrowSize !== undefined && { arrowSize }),
  }
}

const PUBLISHER_MESSAGE_TYPE = 'geometry_msgs/msg/PoseWithCovarianceStamped'

function parsePublishers(
  input: unknown,
  path: string,
  connections: ScenarioConnectionsConfig,
): ScenarioPublisherSpec[] {
  if (!Array.isArray(input)) {
    throw new ScenarioParseError(`${path} must be an array`)
  }
  return input.map((entry, i) => parsePublisherSpec(entry, `${path}[${i}]`, connections))
}

function parsePublisherSpec(
  input: unknown,
  path: string,
  connections: ScenarioConnectionsConfig,
): ScenarioPublisherSpec {
  if (!isObj(input)) {
    throw new ScenarioParseError(`${path} must be an object`)
  }
  // Parse source (connection reference only — publishers push out, not subscribe)
  if (!isObj(input.source)) {
    throw new ScenarioParseError(`${path}.source must be an object`)
  }
  if (typeof input.source.connection !== 'string' || input.source.connection.length === 0) {
    throw new ScenarioParseError(`${path}.source.connection must be a non-empty string`)
  }
  if (!(input.source.connection in connections)) {
    throw new ScenarioParseError(
      `${path}.source.connection "${input.source.connection}" is not defined in scenario.connections`,
    )
  }
  if (typeof input.topic !== 'string' || input.topic.length === 0) {
    throw new ScenarioParseError(`${path}.topic must be a non-empty string`)
  }
  if (typeof input.messageType !== 'string' || input.messageType.length === 0) {
    throw new ScenarioParseError(`${path}.messageType must be a non-empty string`)
  }
  if (input.messageType !== PUBLISHER_MESSAGE_TYPE) {
    throw new ScenarioParseError(
      `${path}.messageType "${input.messageType}" is not supported in publishers[]. ` +
      `Only "${PUBLISHER_MESSAGE_TYPE}" is valid here.`,
    )
  }
  if (input.vehicleId !== undefined && (typeof input.vehicleId !== 'string' || input.vehicleId.length === 0)) {
    throw new ScenarioParseError(`${path}.vehicleId must be a non-empty string`)
  }
  if (input.frameId !== undefined && (typeof input.frameId !== 'string' || input.frameId.length === 0)) {
    throw new ScenarioParseError(`${path}.frameId must be a non-empty string`)
  }
  if (input.childFrameId !== undefined && (typeof input.childFrameId !== 'string' || input.childFrameId.length === 0)) {
    throw new ScenarioParseError(`${path}.childFrameId must be a non-empty string`)
  }
  if (input.rateHz !== undefined) {
    requirePositiveFinite(input.rateHz, `${path}.rateHz`)
  }
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') {
    throw new ScenarioParseError(`${path}.enabled must be a boolean`)
  }
  const noise =
    input.noise !== undefined
      ? parsePublisherNoise(input.noise, `${path}.noise`)
      : undefined
  return {
    source: { connection: input.source.connection as string },
    topic: input.topic as string,
    messageType: input.messageType as string,
    ...(typeof input.vehicleId === 'string' && { vehicleId: input.vehicleId }),
    ...(typeof input.frameId === 'string' && { frameId: input.frameId }),
    ...(typeof input.childFrameId === 'string' && { childFrameId: input.childFrameId }),
    ...(typeof input.rateHz === 'number' && { rateHz: input.rateHz }),
    ...(typeof input.enabled === 'boolean' && { enabled: input.enabled }),
    ...(noise !== undefined && { noise }),
  }
}

function parsePublisherNoise(
  input: unknown,
  path: string,
): ScenarioPublisherNoiseSpec {
  if (!isObj(input)) {
    throw new ScenarioParseError(`${path} must be an object`)
  }
  if (input.model !== 'gaussian2d') {
    throw new ScenarioParseError(
      `${path}.model "${String(input.model)}" is not supported. Only "gaussian2d" is valid.`,
    )
  }
  if (!isObj(input.stdDev)) {
    throw new ScenarioParseError(`${path}.stdDev must be an object`)
  }
  const stdDev: ScenarioPublisherNoiseSpec['stdDev'] = {}
  for (const key of ['x', 'y', 'yaw'] as const) {
    if (input.stdDev[key] !== undefined) {
      const v = input.stdDev[key]
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
        throw new ScenarioParseError(`${path}.stdDev.${key} must be a finite non-negative number`)
      }
      stdDev[key] = v
    }
  }
  let seed: number | undefined
  if (input.seed !== undefined) {
    if (typeof input.seed !== 'number' || !Number.isInteger(input.seed)) {
      throw new ScenarioParseError(`${path}.seed must be an integer`)
    }
    seed = input.seed
  }
  return {
    model: 'gaussian2d',
    stdDev,
    ...(seed !== undefined && { seed }),
  }
}

function parseEntity(input: unknown, index: number): EntitySpec {
  const path = `entities[${index}]`
  if (!isObj(input)) throw new ScenarioParseError(`${path} must be an object`)
  if (typeof input.id !== 'string') {
    throw new ScenarioParseError(`${path}.id must be a string`)
  }
  switch (input.kind) {
    case 'vehicle':
      return {
        kind: 'vehicle',
        id: input.id,
        pose: parsePose(input.pose, `${path}.pose`),
        controls: parseControls(input.controls, `${path}.controls`),
        radius: optionalNumber(input.radius, `${path}.radius`),
      }
    case 'static_obstacle':
      return parseStaticObstacle(input, path)
    case 'dynamic_actor':
      return {
        kind: 'dynamic_actor',
        id: input.id,
        pose: parsePose(input.pose, `${path}.pose`),
        velocity: parseVelocity(input.velocity, `${path}.velocity`),
        radius: optionalNumber(input.radius, `${path}.radius`),
      }
    default:
      throw new ScenarioParseError(`${path}.kind unknown: ${String(input.kind)}`)
  }
}

function parseStaticObstacle(
  input: Record<string, unknown>,
  path: string,
): StaticObstacleSpec {
  const shape =
    input.shape === undefined || input.shape === 'circle'
      ? 'circle'
      : input.shape === 'rectangle'
        ? 'rectangle'
        : (() => {
            throw new ScenarioParseError(
              `${path}.shape must be "circle" or "rectangle"`,
            )
          })()

  if (shape === 'circle') {
    if (!isObj(input.position)) {
      throw new ScenarioParseError(`${path}.position must be an object`)
    }
    return {
      kind: 'static_obstacle',
      id: input.id as string,
      shape: 'circle',
      position: {
        x: requireNumber(input.position.x, `${path}.position.x`),
        y: requireNumber(input.position.y, `${path}.position.y`),
      },
      radius: requireNumber(input.radius, `${path}.radius`),
    }
  }

  return {
    kind: 'static_obstacle',
    id: input.id as string,
    shape: 'rectangle',
    rectangle: parseRectangleObstacle(input.rectangle, `${path}.rectangle`),
  }
}

function parseRectangleObstacle(
  input: unknown,
  path: string,
): RectangleObstacleSpec {
  if (!isObj(input)) {
    throw new ScenarioParseError(`${path} must be an object`)
  }
  const mode = input.mode
  if (mode === 'center') {
    if (!isObj(input.center)) {
      throw new ScenarioParseError(`${path}.center must be an object`)
    }
    const length = requirePositiveFinite(input.length, `${path}.length`)
    const thickness = requirePositiveFinite(input.thickness, `${path}.thickness`)
    return {
      mode: 'center',
      center: {
        x: requireNumber(input.center.x, `${path}.center.x`),
        y: requireNumber(input.center.y, `${path}.center.y`),
      },
      length,
      thickness,
      yaw: requireNumber(input.yaw, `${path}.yaw`),
    }
  }
  if (mode === 'segment') {
    if (!isObj(input.start)) {
      throw new ScenarioParseError(`${path}.start must be an object`)
    }
    if (!isObj(input.end)) {
      throw new ScenarioParseError(`${path}.end must be an object`)
    }
    const thickness = requirePositiveFinite(input.thickness, `${path}.thickness`)
    const start = {
      x: requireNumber(input.start.x, `${path}.start.x`),
      y: requireNumber(input.start.y, `${path}.start.y`),
    }
    const end = {
      x: requireNumber(input.end.x, `${path}.end.x`),
      y: requireNumber(input.end.y, `${path}.end.y`),
    }
    const segLength = Math.hypot(end.x - start.x, end.y - start.y)
    if (!(segLength > 0)) {
      throw new ScenarioParseError(
        `${path}.start and ${path}.end must not be identical`,
      )
    }
    return { mode: 'segment', start, end, thickness }
  }
  throw new ScenarioParseError(
    `${path}.mode must be "center" or "segment"`,
  )
}

function buildStaticObstacleEntity(spec: StaticObstacleSpec): StaticObstacleEntity {
  // Positive discriminator first so TypeScript narrows `spec` to
  // `RectangleStaticObstacleSpec` inside this block. The inverse
  // "`shape === undefined || === 'circle'`" pattern confuses the
  // optional-literal narrowing.
  if (spec.shape === 'rectangle') {
    const rect = normalizeRectangle(spec.rectangle)
    return new StaticObstacleEntity({
      id: spec.id,
      position: new Point2D(rect.center.x, rect.center.y),
      shape: {
        type: 'rectangle',
        length: rect.length,
        thickness: rect.thickness,
        yaw: rect.yaw,
      },
    })
  }

  // Legacy / circle path: a plain `position + radius` entity. Do NOT
  // pass the `shape` option so the circle constructor path is
  // exercised — this is what existing tests assert and what external
  // callers rely on.
  return new StaticObstacleEntity({
    id: spec.id,
    position: new Point2D(spec.position.x, spec.position.y),
    radius: spec.radius,
  })
}

/**
 * Collapse both rectangle authoring modes into a single normalized
 * `{ center, length, thickness, yaw }` record. Exposed at module scope
 * (not on the class) because the normalization is pure data and easy
 * to unit-test in isolation.
 */
export function normalizeRectangle(
  spec: RectangleObstacleSpec,
): {
  center: { x: number; y: number }
  length: number
  thickness: number
  yaw: number
} & Pick<ObstacleRectangle2D, 'length' | 'thickness' | 'yaw'> {
  if (spec.mode === 'center') {
    return {
      center: { x: spec.center.x, y: spec.center.y },
      length: spec.length,
      thickness: spec.thickness,
      yaw: spec.yaw,
    }
  }
  const dx = spec.end.x - spec.start.x
  const dy = spec.end.y - spec.start.y
  const length = Math.hypot(dx, dy)
  return {
    center: {
      x: (spec.start.x + spec.end.x) / 2,
      y: (spec.start.y + spec.end.y) / 2,
    },
    length,
    thickness: spec.thickness,
    yaw: Math.atan2(dy, dx),
  }
}

/* -------------------------------------------------------------------------
 * Sensor parsing
 * ---------------------------------------------------------------------- */

function parseSensors(input: unknown, path: string): LidarSensorSpec[] {
  if (!Array.isArray(input)) {
    throw new ScenarioParseError(`${path} must be an array`)
  }
  return input.map((item: unknown, i: number) => parseSensorSpec(item, `${path}[${i}]`))
}

function parseSensorSpec(input: unknown, path: string): LidarSensorSpec {
  if (!isObj(input)) throw new ScenarioParseError(`${path} must be an object`)

  if (input.kind !== 'lidar2d') {
    throw new ScenarioParseError(
      `${path}.kind must be 'lidar2d' (got ${String(input.kind)})`,
    )
  }
  if (typeof input.id !== 'string' || input.id.trim() === '') {
    throw new ScenarioParseError(`${path}.id must be a non-empty string`)
  }

  const rateHz = input.rateHz !== undefined
    ? requirePositiveNumber(input.rateHz, `${path}.rateHz`)
    : undefined

  const angleMin = requireNumber(input.angleMin, `${path}.angleMin`)
  const angleMax = requireNumber(input.angleMax, `${path}.angleMax`)
  if (angleMax <= angleMin) {
    throw new ScenarioParseError(
      `${path}.angleMax (${angleMax}) must be greater than ${path}.angleMin (${angleMin})`,
    )
  }

  const rayCount = requireInteger(input.rayCount, `${path}.rayCount`)
  if (rayCount < 2) {
    throw new ScenarioParseError(`${path}.rayCount must be >= 2 (got ${rayCount})`)
  }

  const rangeMin = requireNonNegNumber(input.rangeMin, `${path}.rangeMin`)
  const rangeMax = requirePositiveNumber(input.rangeMax, `${path}.rangeMax`)
  if (rangeMax <= rangeMin) {
    throw new ScenarioParseError(
      `${path}.rangeMax (${rangeMax}) must be greater than ${path}.rangeMin (${rangeMin})`,
    )
  }

  const noise =
    input.noise !== undefined ? parseNoiseConfig(input.noise, `${path}.noise`) : undefined

  const pose =
    input.pose !== undefined ? parsePose(input.pose, `${path}.pose`) : undefined

  return {
    kind: 'lidar2d',
    id: input.id as string,
    ...(typeof input.parentEntityId === 'string' && { parentEntityId: input.parentEntityId }),
    ...(typeof input.frameId === 'string' && { frameId: input.frameId }),
    ...(pose !== undefined && { pose }),
    ...(input.enabled !== undefined && { enabled: Boolean(input.enabled) }),
    ...(rateHz !== undefined && { rateHz }),
    angleMin,
    angleMax,
    rayCount,
    rangeMin,
    rangeMax,
    ...(input.includeStaticObstacles !== undefined && {
      includeStaticObstacles: Boolean(input.includeStaticObstacles),
    }),
    ...(input.includeVehicles !== undefined && {
      includeVehicles: Boolean(input.includeVehicles),
    }),
    ...(input.includeDynamicActors !== undefined && {
      includeDynamicActors: Boolean(input.includeDynamicActors),
    }),
    ...(noise !== undefined && { noise }),
  }
}

function parseNoiseConfig(input: unknown, path: string): LidarNoiseConfig {
  if (!isObj(input)) throw new ScenarioParseError(`${path} must be an object`)

  const cfg: LidarNoiseConfig = {}

  if (input.enabled !== undefined) cfg.enabled = Boolean(input.enabled)

  const numFields: (keyof LidarNoiseConfig)[] = [
    'rangeStdDev', 'rangeBias', 'angularStdDev',
    'outlierMinRange', 'outlierMaxRange', 'quantizationStep',
  ]
  for (const field of numFields) {
    if (input[field] !== undefined) {
      cfg[field] = requireNonNegNumber(input[field], `${path}.${field}`) as never
    }
  }

  const probFields: (keyof LidarNoiseConfig)[] = [
    'dropoutProbability', 'outlierProbability',
  ]
  for (const field of probFields) {
    if (input[field] !== undefined) {
      const v = requireNonNegNumber(input[field], `${path}.${field}`)
      if (v > 1) {
        throw new ScenarioParseError(
          `${path}.${field} must be in [0, 1] (got ${v})`,
        )
      }
      cfg[field] = v as never
    }
  }

  if (input.seed !== undefined) {
    cfg.seed = requireInteger(input.seed, `${path}.seed`)
  }

  return cfg
}

function requirePositiveNumber(v: unknown, path: string): number {
  const n = requireNumber(v, path)
  if (n <= 0) throw new ScenarioParseError(`${path} must be > 0 (got ${n})`)
  return n
}

function requireNonNegNumber(v: unknown, path: string): number {
  const n = requireNumber(v, path)
  if (n < 0) throw new ScenarioParseError(`${path} must be >= 0 (got ${n})`)
  return n
}

function requireInteger(v: unknown, path: string): number {
  const n = requireNumber(v, path)
  if (!Number.isInteger(n)) {
    throw new ScenarioParseError(`${path} must be an integer (got ${n})`)
  }
  return n
}
