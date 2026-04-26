/**
 * Catalog of well-known logical topic names used by the simulator.
 *
 * Names are intentionally simulator-flavored (`/sim/...`, `/control/...`).
 * They do NOT need to match any external broker's naming. Mapping to a
 * specific broker (rosbridge / DDS / MQTT) is the responsibility of an
 * adapter or a transport-level routing table — never of the engine.
 *
 * `frequencyHz` is a hint consumed by `PeriodicPublisher` when wiring
 * communication. Subscribed topics typically don't carry a frequency.
 */

export type TopicDirection = 'publish' | 'subscribe'

export interface TopicDefinition<_TInternal = unknown> {
  name: string
  direction: TopicDirection
  frequencyHz?: number
  description?: string
}

export const Topics = {
  egoCommand: {
    name: '/control/ego/command',
    direction: 'subscribe',
    description: 'Receives external commands for the ego vehicle',
  },

  egoState: {
    name: '/sim/ego/state',
    direction: 'publish',
    frequencyHz: 20,
    description: 'Publishes ego vehicle state',
  },

  clock: {
    name: '/sim/clock',
    direction: 'publish',
    frequencyHz: 50,
    description: 'Publishes simulation clock',
  },

  collision: {
    name: '/sim/collision',
    direction: 'publish',
    description: 'Publishes collision events',
  },
} satisfies Record<string, TopicDefinition>
