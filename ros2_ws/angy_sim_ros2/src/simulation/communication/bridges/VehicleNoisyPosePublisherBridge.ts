import type { Transport } from '../Transport'
import type { TopicBridge } from '../TopicBridge'
import type { MessageAdapter } from '../MessageAdapter'
import type { SimulationEngine } from '../../core/SimulationEngine'
import type { SimPoseWithCovarianceMessage } from '../messages/SimPoseWithCovarianceMessage'
import type { VehicleEntity } from '../../entities/VehicleEntity'
import type { GaussianPoseNoise2D } from '../../sensors/GaussianPoseNoise2D'

/**
 * Publishes a vehicle's noisy measured pose as a `SimPoseWithCovarianceMessage`.
 *
 * Drive this bridge through a `PeriodicPublisher` so the publish cadence is
 * governed by simulation time, not wall-clock. The bridge does not own a timer.
 *
 * Ground truth is read from `SimulationEngine` on every `publishOnce()` call.
 * The noise model is applied before building the message — the vehicle entity
 * is never mutated.
 */
export class VehicleNoisyPosePublisherBridge implements TopicBridge {
  private started = false
  private readonly transport: Transport
  private readonly vehicleId: string
  private readonly topic: string
  private readonly engine: SimulationEngine
  private readonly adapter: MessageAdapter<unknown, SimPoseWithCovarianceMessage>
  private readonly noiseModel: GaussianPoseNoise2D
  private readonly frameId: string
  private readonly childFrameId: string

  constructor(
    transport: Transport,
    vehicleId: string,
    topic: string,
    engine: SimulationEngine,
    adapter: MessageAdapter<unknown, SimPoseWithCovarianceMessage>,
    noiseModel: GaussianPoseNoise2D,
    frameId = 'map',
    childFrameId?: string,
  ) {
    this.transport = transport
    this.vehicleId = vehicleId
    this.topic = topic
    this.engine = engine
    this.adapter = adapter
    this.noiseModel = noiseModel
    this.frameId = frameId
    this.childFrameId = childFrameId ?? vehicleId
  }

  async start(): Promise<void> {
    this.started = true
  }

  async stop(): Promise<void> {
    this.started = false
  }

  async publishOnce(): Promise<void> {
    if (!this.started) return

    const entity = this.engine.state.entities.get(this.vehicleId)
    if (!entity || entity.type !== 'vehicle') return

    const vehicle = entity as VehicleEntity
    const noisy = this.noiseModel.sample({
      x: vehicle.pose.position.x,
      y: vehicle.pose.position.y,
      yaw: vehicle.pose.yaw,
    })

    const message: SimPoseWithCovarianceMessage = {
      header: {
        stampSec: this.engine.state.clock.timeSec,
        frameId: this.frameId,
      },
      childFrameId: this.childFrameId,
      pose: { x: noisy.x, y: noisy.y, yaw: noisy.yaw },
      covariance: this.noiseModel.buildCovariance(),
      source: { vehicleId: this.vehicleId, measurement: 'noisy_pose' },
    }

    const external = this.adapter.fromInternal(message)
    await this.transport.publish(this.topic, external)
  }
}
