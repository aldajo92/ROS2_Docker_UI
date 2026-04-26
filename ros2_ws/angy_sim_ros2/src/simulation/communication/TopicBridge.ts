/**
 * A `TopicBridge` wires a `Transport` topic to the simulation engine,
 * its entities, events, or state. Bridges encapsulate the "what to do
 * when a message arrives" / "what to send out" decision so that the
 * `Transport` stays generic and the engine stays unaware of the
 * external schema.
 *
 * Bridges:
 *   - MAY read engine state and entity APIs.
 *   - MAY emit engine events.
 *   - MUST NOT mutate renderer state.
 *   - MUST NOT mutate engine internals through random field writes —
 *     prefer entity command APIs (e.g. `VehicleEntity.setCommand`).
 */
export interface TopicBridge {
  start(): Promise<void>
  stop(): Promise<void>
}
