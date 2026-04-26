import type { SimulationEngine } from './SimulationEngine'
import { ScenarioLoader } from '../scenarios/ScenarioLoader'

/**
 * Thin facade over SimulationEngine for UI / external callers. Keeps
 * the engine's public API focused on simulation concerns and lifts
 * higher-level conveniences (URL / JSON loading) up to the boundary.
 */
export class SimulationController {
  private engine: SimulationEngine

  constructor(engine: SimulationEngine) {
    this.engine = engine
  }

  start(): void {
    this.engine.start()
  }

  pause(): void {
    this.engine.pause()
  }

  reset(): void {
    this.engine.reset()
  }

  step(dt?: number): void {
    this.engine.step(dt)
  }

  async loadScenarioFromUrl(url: string): Promise<void> {
    const spec = await ScenarioLoader.loadFromUrl(url)
    this.engine.loadScenario(spec)
  }

  loadScenarioFromJson(json: unknown): void {
    const spec = ScenarioLoader.parse(json)
    this.engine.loadScenario(spec)
  }

  isRunning(): boolean {
    return this.engine.isRunning()
  }

  getEngine(): SimulationEngine {
    return this.engine
  }
}
