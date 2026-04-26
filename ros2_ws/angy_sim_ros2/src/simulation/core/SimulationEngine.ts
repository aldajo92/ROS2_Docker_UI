import { Logger } from '../logging/Logger'
import { TypedEventBus } from '../events/EventBus'
import type { SimulationEvents } from '../events/SimulationEvents'
import type { Entity } from '../entities/Entity'
import type { SimulationSystem } from '../systems/SimulationSystem'
import type { ScenarioSpec } from '../scenarios/Scenario'
import { ScenarioLoader } from '../scenarios/ScenarioLoader'

import { EntityManager } from './EntityManager'
import { SystemManager } from './SystemManager'
import { SimulationClock } from './SimulationClock'
import { SimulationLoop } from './SimulationLoop'
import { SimulationState } from './SimulationState'

export interface SimulationEngineOptions {
  fixedDtSec?: number
  logger?: Logger
}

/**
 * Top-level orchestrator. Owns the clock, entity manager, system
 * manager, event bus, logger, and loop. Public surface is
 * deliberately small: start / pause / reset / step / loadScenario
 * (plus add/remove helpers). Consumers wanting more should reach
 * through `engine.systems`, `engine.entities`, or `engine.events`.
 */
export class SimulationEngine {
  readonly clock: SimulationClock
  readonly entities: EntityManager
  readonly systems: SystemManager
  readonly events: TypedEventBus<SimulationEvents>
  readonly logger: Logger
  readonly state: SimulationState
  private loop: SimulationLoop

  constructor(options: SimulationEngineOptions = {}) {
    this.clock = new SimulationClock()
    this.entities = new EntityManager()
    this.systems = new SystemManager()
    this.events = new TypedEventBus<SimulationEvents>()
    this.logger = options.logger ?? new Logger()
    this.state = new SimulationState(
      this.clock,
      this.entities,
      this.events,
      this.logger,
    )
    this.loop = new SimulationLoop({ fixedDtSec: options.fixedDtSec ?? 1 / 60 })
    this.loop.setStepCallback((dt) => this.tick(dt))
  }

  /* -- lifecycle ------------------------------------------------------- */

  start(): void {
    if (this.loop.isRunning()) return
    this.loop.start()
    this.events.emit('started', undefined)
  }

  pause(): void {
    if (!this.loop.isRunning()) return
    this.loop.pause()
    this.events.emit('paused', undefined)
  }

  /** Manually advance one step. Ignored while the timer-driven loop runs. */
  step(dt?: number): void {
    if (this.loop.isRunning()) {
      this.logger.warn('SimulationEngine.step ignored: loop is running')
      return
    }
    this.tick(dt ?? this.loop.getFixedDt())
  }

  reset(): void {
    this.loop.pause()
    this.clock.reset()
    this.entities.clear()
    this.state.resetMetrics()
    this.state.paths.clear()
    this.state.scenarioName = null
    this.systems.reset()
    this.events.emit('reset', undefined)
  }

  /* -- scenario -------------------------------------------------------- */

  loadScenario(spec: ScenarioSpec): void {
    this.reset()
    for (const entitySpec of spec.entities) {
      const entity = ScenarioLoader.buildEntity(entitySpec)
      this.entities.add(entity)
      this.events.emit('entityAdded', { id: entity.id })
    }
    for (const pathSpec of spec.paths ?? []) {
      this.state.paths.add({
        id: pathSpec.id,
        name: pathSpec.name,
        frameId: pathSpec.frameId,
        vehicleId: pathSpec.vehicleId,
        points: pathSpec.points,
      })
    }
    this.state.scenarioName = spec.name
    this.events.emit('scenarioLoaded', { name: spec.name })
  }

  /* -- entity helpers -------------------------------------------------- */

  addEntity(entity: Entity): void {
    this.entities.add(entity)
    this.events.emit('entityAdded', { id: entity.id })
  }

  removeEntity(id: string): boolean {
    if (this.entities.remove(id)) {
      this.events.emit('entityRemoved', { id })
      return true
    }
    return false
  }

  /* -- system helpers -------------------------------------------------- */

  addSystem(system: SimulationSystem): void {
    this.systems.add(system)
  }

  /* -- introspection --------------------------------------------------- */

  isRunning(): boolean {
    return this.loop.isRunning()
  }

  getFixedDt(): number {
    return this.loop.getFixedDt()
  }

  setSpeedFactor(factor: number): void {
    this.loop.setSpeedFactor(factor)
  }

  /* -- internals ------------------------------------------------------- */

  private tick(dt: number): void {
    this.clock.tick(dt)
    this.systems.update(dt, this.state)
    this.state.metrics.ticks += 1
    this.events.emit('tick', {
      time: this.clock.time(),
      dt,
      ticks: this.state.metrics.ticks,
    })
  }
}
