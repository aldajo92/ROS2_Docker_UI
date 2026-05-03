import type {
  TopicDiscovery,
  TopicInfo,
} from '../../../app/TopicDiscovery'

/**
 * `TopicDiscovery` implementation backed by rosbridge's `rosapi`
 * service. The class itself never imports `roslib` — it accepts a
 * `ServiceCaller` callback the wider system supplies, so this file
 * is trivially testable and the architecture-boundary check still
 * passes.
 *
 * The default service name + type targets the ROS 2 `rosapi_msgs`
 * package. ROS 1 / Galactic / older Foxy installs ship the same
 * service under `rosapi/Topics`; we expose the type name as a
 * constructor option so a downstream consumer can override it.
 */

const ROSAPI_TOPICS_SERVICE_NAME = '/rosapi/topics'
const ROSAPI_TOPICS_SERVICE_TYPE_DEFAULT = 'rosapi_msgs/srv/Topics'

/** Wire-format response for `rosapi_msgs/srv/Topics`. */
export interface RosapiTopicsResponse {
  topics: string[]
  /** Same length as `topics`; empty strings are tolerated. */
  types: string[]
}

/** Function shape the discovery uses to perform service calls. */
export type ServiceCaller = <TReq, TRes>(
  name: string,
  serviceType: string,
  request: TReq,
) => Promise<TRes>

export interface RosbridgeTopicDiscoveryOptions {
  /**
   * Override for the rosapi service type. Defaults to
   * `rosapi_msgs/srv/Topics` (ROS 2). For ROS 1 servers, pass
   * `rosapi/Topics`.
   */
  topicsServiceType?: string
  /**
   * Override the service name. Almost never needed; exposed for tests
   * and for installs that namespace `rosapi`.
   */
  topicsServiceName?: string
}

export class RosbridgeTopicDiscovery implements TopicDiscovery {
  private readonly serviceName: string
  private readonly serviceType: string

  constructor(
    private readonly callService: ServiceCaller,
    options: RosbridgeTopicDiscoveryOptions = {},
  ) {
    this.serviceName = options.topicsServiceName ?? ROSAPI_TOPICS_SERVICE_NAME
    this.serviceType =
      options.topicsServiceType ?? ROSAPI_TOPICS_SERVICE_TYPE_DEFAULT
  }

  async refreshTopics(): Promise<TopicInfo[]> {
    const response = await this.callService<
      Record<string, never>,
      RosapiTopicsResponse
    >(this.serviceName, this.serviceType, {})
    return parseTopicsResponse(response)
  }
}

/**
 * Pure parser for `rosapi_msgs/srv/Topics` responses. Exported for
 * unit tests; callers should use {@link RosbridgeTopicDiscovery}
 * instead of invoking this directly.
 *
 * - Pairs each `topics[i]` with `types[i]` when present; missing /
 *   empty types collapse to `undefined` so the UI can decide how to
 *   display "type unknown".
 * - Drops any topic with an empty / non-string name.
 * - De-duplicates by name (the rosapi service is supposed to return
 *   distinct names but we don't trust the wire).
 * - Returns the result sorted alphabetically for deterministic UI.
 */
export function parseTopicsResponse(
  response: RosapiTopicsResponse,
): TopicInfo[] {
  if (!response || !Array.isArray(response.topics)) return []
  const types = Array.isArray(response.types) ? response.types : []
  const seen = new Set<string>()
  const out: TopicInfo[] = []
  for (let i = 0; i < response.topics.length; i++) {
    const name = response.topics[i]
    if (typeof name !== 'string' || name.length === 0) continue
    if (seen.has(name)) continue
    seen.add(name)
    const type = types[i]
    out.push({
      name,
      type: typeof type === 'string' && type.length > 0 ? type : undefined,
    })
  }
  out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return out
}

export const ROSAPI_TOPICS_SERVICE = {
  name: ROSAPI_TOPICS_SERVICE_NAME,
  type: ROSAPI_TOPICS_SERVICE_TYPE_DEFAULT,
} as const
