/**
 * Future inbound message shape for externally-computed paths
 * (Python planner, ROS2/WebSocket bridge, etc.).
 *
 * Flow (not yet implemented):
 *   external source → SimPathMessage → MessageAdapter → PathBridge
 *     → state.paths.add(path) → ThreePathRenderer.sync() renders it
 *
 * PathBridge must not mutate renderer state directly.
 */
export type SimPathMessage = {
  id: string;
  vehicleId?: string;
  frameId?: string;
  points: Array<{
    x: number;
    y: number;
    yaw?: number;
    targetVelocity?: number;
    timeSec?: number;
  }>;
};
