import * as THREE from 'three'
import { Point2D } from '../../../../math/geometry/Point2D'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { ThreeTrajectoryVisualizationConfig } from '../config/ThreeRendererConfig'
import { DEFAULT_THREE_TRAJECTORY_VISUALIZATION_CONFIG } from '../config/ThreeRendererConfig'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import { simPoint2DToThree } from '../mapping/simToThree'

export type ThreeTrajectoryEntityDebug = {
  entityId: string
  sampleCount: number
  hasLine: boolean
  visible: boolean
  attachedToScene: boolean
  positionAttributeCount: number
  materialOpacity: number
  materialTransparent: boolean
  materialColor: string
  lineRenderOrder: number
  firstMappedPoint?: { x: number; y: number; z: number }
  lastMappedPoint?: { x: number; y: number; z: number }
  geometryBoundingBox?: {
    min: { x: number; y: number; z: number }
    max: { x: number; y: number; z: number }
  }
}

export type ThreeTrajectoryRendererDebugSummary = {
  enabled: boolean
  trajectoryCount: number
  totalSampleCount: number
  perEntity: ThreeTrajectoryEntityDebug[]
}

export class ThreeTrajectoryRenderer {
  private readonly context: ThreeSceneContext
  private readonly lines = new Map<string, THREE.Line>()
  private config: ThreeTrajectoryVisualizationConfig
  private readonly lastSeenSamples = new Map<string, number>()
  private lastTrajectoryCount = 0
  private lastTotalSampleCount = 0

  constructor(
    context: ThreeSceneContext,
    config: Partial<ThreeTrajectoryVisualizationConfig> = {},
  ) {
    this.context = context
    this.config = {
      ...DEFAULT_THREE_TRAJECTORY_VISUALIZATION_CONFIG,
      ...config,
    }
  }

  sync(state: SimulationState): void {
    if (!this.config.enabled) {
      for (const line of this.lines.values()) line.visible = false
      this.captureSyncStats(state)
      return
    }
    for (const line of this.lines.values()) line.visible = true

    const trajectories = state.trajectories.toArray()
    const activeIds = this.collectActiveIds(trajectories)
    this.removeStaleLines(activeIds)

    for (const trajectory of trajectories) {
      if (trajectory.samples.length === 0) continue
      const line = this.ensureLine(trajectory.entityId)
      this.updateGeometryFromSamples(line, trajectory.samples)
    }
    this.captureSyncStats(state)
  }

  private collectActiveIds(
    trajectories: ReadonlyArray<{
      entityId: string
      samples: ReadonlyArray<unknown>
    }>,
  ): Set<string> {
    const ids = new Set<string>()
    for (const t of trajectories) {
      if (t.samples.length > 0) ids.add(t.entityId)
    }
    return ids
  }

  private removeStaleLines(activeIds: Set<string>): void {
    const staleIds: string[] = []
    for (const id of this.lines.keys()) {
      if (!activeIds.has(id)) staleIds.push(id)
    }
    for (const id of staleIds) this.removeLine(id)
  }

  private ensureLine(entityId: string): THREE.Line {
    const existing = this.lines.get(entityId)
    if (existing) {
      this.applyMaterial(existing.material as THREE.LineBasicMaterial)
      return existing
    }
    const geometry = new THREE.BufferGeometry()
    const material = this.createMaterial()
    const line = new THREE.Line(geometry, material)
    line.frustumCulled = false
    line.name = `trajectory:${entityId}`
    this.lines.set(entityId, line)
    this.context.scene.add(line)
    return line
  }

  private updateGeometryFromSamples(
    line: THREE.Line,
    samples: ReadonlyArray<{ x: number; y: number }>,
  ): void {
    // Do NOT use BufferGeometry.setFromPoints here. In three r140+ it
    // *reuses* the existing 'position' attribute and clamps writes to
    // its current capacity, which permanently locks the line at the
    // size it had at first creation (typically 1 vertex → invisible
    // line). Always rebuild a fresh position attribute sized to the
    // current sample count.
    const positions = new Float32Array(samples.length * 3)
    const height = this.config.height
    for (let i = 0; i < samples.length; i++) {
      const v = simPoint2DToThree(
        Point2D.of(samples[i].x, samples[i].y),
        height,
      )
      const offset = i * 3
      positions[offset] = v.x
      positions[offset + 1] = v.y
      positions[offset + 2] = v.z
    }
    const attribute = new THREE.BufferAttribute(positions, 3)
    line.geometry.setAttribute('position', attribute)
    line.geometry.setDrawRange(0, samples.length)
  }

  setConfig(partial: Partial<ThreeTrajectoryVisualizationConfig>): void {
    this.config = { ...this.config, ...partial }
    for (const line of this.lines.values()) {
      this.applyMaterial(line.material as THREE.LineBasicMaterial)
    }
  }

  getConfig(): ThreeTrajectoryVisualizationConfig {
    return { ...this.config }
  }

  clearRenderCache(): void {
    const allIds: string[] = []
    this.lines.forEach((_value, id) => allIds.push(id))
    for (const id of allIds) this.removeLine(id)
  }

  dispose(): void {
    this.clearRenderCache()
  }

  private createMaterial(): THREE.LineBasicMaterial {
    const material = new THREE.LineBasicMaterial({
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    })
    this.applyMaterial(material)
    return material
  }

  private applyMaterial(material: THREE.LineBasicMaterial): void {
    material.color.set(this.config.color)
    material.opacity = this.config.opacity
    material.transparent = this.config.opacity < 1
    material.linewidth = this.config.lineWidth
    material.needsUpdate = true
  }

  private removeLine(id: string): void {
    const line = this.lines.get(id)
    if (!line) return
    this.context.scene.remove(line)
    line.geometry.dispose()
    if (Array.isArray(line.material)) line.material.forEach((m) => m.dispose())
    else line.material.dispose()
    this.lines.delete(id)
  }

  private captureSyncStats(state: SimulationState): void {
    const trajectories = state.trajectories.toArray()
    this.lastTrajectoryCount = trajectories.length
    let total = 0
    this.lastSeenSamples.clear()
    for (const trajectory of trajectories) {
      this.lastSeenSamples.set(trajectory.entityId, trajectory.samples.length)
      total += trajectory.samples.length
    }
    this.lastTotalSampleCount = total
  }

  getDebugSummary(): ThreeTrajectoryRendererDebugSummary {
    const ids = new Set<string>()
    this.lastSeenSamples.forEach((_count, id) => ids.add(id))
    this.lines.forEach((_line, id) => ids.add(id))

    const perEntity: ThreeTrajectoryEntityDebug[] = []
    ids.forEach((id) => {
      perEntity.push(this.buildEntityDebug(id))
    })

    return {
      enabled: this.config.enabled,
      trajectoryCount: this.lastTrajectoryCount,
      totalSampleCount: this.lastTotalSampleCount,
      perEntity,
    }
  }

  private buildEntityDebug(id: string): ThreeTrajectoryEntityDebug {
    const sampleCount = this.lastSeenSamples.get(id) ?? 0
    const line = this.lines.get(id)
    if (!line) {
      return {
        entityId: id,
        sampleCount,
        hasLine: false,
        visible: false,
        attachedToScene: false,
        positionAttributeCount: 0,
        materialOpacity: 0,
        materialTransparent: false,
        materialColor: '#000000',
        lineRenderOrder: 0,
      }
    }
    const material = line.material as THREE.LineBasicMaterial
    const geometry = line.geometry
    const positionAttribute = geometry.getAttribute('position') as
      | THREE.BufferAttribute
      | undefined
    let firstMappedPoint: { x: number; y: number; z: number } | undefined
    let lastMappedPoint: { x: number; y: number; z: number } | undefined
    if (positionAttribute && positionAttribute.count > 0) {
      firstMappedPoint = {
        x: positionAttribute.getX(0),
        y: positionAttribute.getY(0),
        z: positionAttribute.getZ(0),
      }
      const lastIndex = positionAttribute.count - 1
      lastMappedPoint = {
        x: positionAttribute.getX(lastIndex),
        y: positionAttribute.getY(lastIndex),
        z: positionAttribute.getZ(lastIndex),
      }
    }
    geometry.computeBoundingBox()
    const boundingBox = geometry.boundingBox
      ? {
          min: {
            x: geometry.boundingBox.min.x,
            y: geometry.boundingBox.min.y,
            z: geometry.boundingBox.min.z,
          },
          max: {
            x: geometry.boundingBox.max.x,
            y: geometry.boundingBox.max.y,
            z: geometry.boundingBox.max.z,
          },
        }
      : undefined
    return {
      entityId: id,
      sampleCount,
      hasLine: true,
      visible: line.visible,
      attachedToScene: line.parent === this.context.scene,
      positionAttributeCount: positionAttribute?.count ?? 0,
      materialOpacity: material.opacity,
      materialTransparent: material.transparent,
      materialColor: `#${material.color.getHexString()}`,
      lineRenderOrder: line.renderOrder,
      firstMappedPoint,
      lastMappedPoint,
      geometryBoundingBox: boundingBox,
    }
  }
}
